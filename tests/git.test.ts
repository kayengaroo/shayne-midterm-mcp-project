import fs from "node:fs/promises";
import path from "node:path";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { call, createTestEnv, type TestEnv } from "./helpers.js";

let env: TestEnv;
beforeAll(async () => {
  env = await createTestEnv();
});
afterAll(() => env.cleanup());

describe("git-lite tools", () => {
  it("workspace is initialised as its own git repo with an initial commit", async () => {
    const c = await env.connect();
    const log = await call(c, "git_log");
    expect(log.json.commits).toHaveLength(1);
    expect(log.json.commits[0].subject).toBe("Initialize workspace");
    expect((await call(c, "git_status")).json.clean).toBe(true);
  });
  it("status/diff/commit/log work end to end", async () => {
    const c = await env.connect();
    await call(c, "write_file", { path: "g.txt", content: "v1\n" });
    const st = await call(c, "git_status");
    expect(st.json.clean).toBe(false);
    expect(st.json.entries).toEqual([{ status: "??", path: "g.txt" }]);

    const first = await call(c, "git_commit", { message: "add g", paths: ["g.txt"] });
    expect(first.isError).toBe(false);
    await call(c, "str_replace", { path: "g.txt", old_str: "v1", new_str: "v2" });
    const diff = await call(c, "git_diff", { path: "g.txt" });
    expect(diff.json.diff).toContain("-v1");
    expect(diff.json.diff).toContain("+v2");

    expect((await call(c, "git_commit", { message: "update g" })).json.commit).toMatch(/^[0-9a-f]{7,}$/);
    const log = await call(c, "git_log", { max_count: 2 });
    expect(log.json.commits.map((x: any) => x.subject)).toEqual(["update g", "add g"]);
    expect((await call(c, "git_status")).json.clean).toBe(true);
  });
  it("commit with nothing to commit is a clean error", async () => {
    const c = await env.connect();
    const r = await call(c, "git_commit", { message: "empty" });
    expect(r.isError).toBe(true);
    expect(r.text).toMatch(/Nothing to commit/);
  });
  it("is not vulnerable to option/shell injection through message or path", async () => {
    const c = await env.connect();
    await call(c, "write_file", { path: "inj.txt", content: "x" });
    const marker = path.join(env.dir, "pwned");
    const r = await call(c, "git_commit", { message: `--amend; touch ${marker}; $(touch ${marker})`, paths: ["inj.txt"] });
    expect(r.isError).toBe(false);
    await expect(fs.stat(marker)).rejects.toThrow();
    expect((await call(c, "git_diff", { path: "--output=/tmp/x" })).isError).toBe(false); // treated as a path, after "--"
    expect((await call(c, "git_log")).json.commits[0].subject).toContain("--amend");
  });
  it("git paths are sandboxed and never expose .env", async () => {
    const c = await env.connect();
    expect((await call(c, "git_diff", { path: "../x" })).isError).toBe(true);
    expect((await call(c, "git_commit", { message: "m", paths: [".git"] })).isError).toBe(true);
    await fs.writeFile(path.join(env.workspace, ".env"), "SECRET=1");
    expect((await call(c, "git_status")).json.entries.map((e: any) => e.path)).not.toContain(".env");
  });
});
