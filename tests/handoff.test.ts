import fs from "node:fs/promises";
import path from "node:path";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { call, createTestEnv, type TestEnv } from "./helpers.js";

let env: TestEnv;
beforeAll(async () => {
  env = await createTestEnv();
});
afterAll(() => env.cleanup());

describe("handoff protocol", () => {
  it("creates all four files on startup", async () => {
    for (const n of ["PROJECT_STATE", "PLAN_LOG", "CHECKPOINTS", "DECISIONS"]) {
      await fs.stat(path.join(env.workspace, `${n}.md`));
    }
    const c = await env.connect();
    const r = await call(c, "handoff_read");
    expect(r.json.files.map((f: any) => f.file)).toEqual(["PROJECT_STATE", "PLAN_LOG", "CHECKPOINTS", "DECISIONS"]);
  });
  it("PROJECT_STATE: replace needs if_version; stale versions are rejected", async () => {
    const c = await env.connect();
    const v = (await call(c, "handoff_read", { file: "PROJECT_STATE" })).json.files[0].version;
    expect((await call(c, "handoff_update", { file: "PROJECT_STATE", mode: "replace", agent: "a", content: "# S\nnew" })).text).toMatch(/requires if_version/);
    const ok = await call(c, "handoff_update", { file: "PROJECT_STATE", mode: "replace", agent: "a", content: "# S\nnew", if_version: v });
    expect(ok.isError).toBe(false);
    const stale = await call(c, "handoff_update", { file: "PROJECT_STATE", mode: "replace", agent: "b", content: "# S\nclobber", if_version: v });
    expect(stale.text).toMatch(/Version conflict/);
    expect((await call(c, "handoff_read", { file: "PROJECT_STATE" })).json.files[0].content).toContain("new");
  });
  it("logs are append-only, timestamped and attributed", async () => {
    const c = await env.connect();
    expect((await call(c, "handoff_update", { file: "PLAN_LOG", mode: "replace", agent: "a", content: "x", if_version: "0000000000000000" })).text).toMatch(/append-only/);
    expect((await call(c, "handoff_update", { file: "PROJECT_STATE", mode: "append", agent: "a", content: "x" })).isError).toBe(true);
    await call(c, "handoff_update", { file: "PLAN_LOG", mode: "append", agent: "agent-1", content: "did step 1" });
    await call(c, "handoff_update", { file: "PLAN_LOG", mode: "append", agent: "agent-2", content: "did step 2" });
    const text = (await call(c, "handoff_read", { file: "PLAN_LOG" })).json.files[0].content as string;
    expect(text).toMatch(/### \d{4}-\d\d-\d\dT.* \| agent-1\ndid step 1/);
    expect(text.indexOf("agent-1")).toBeLessThan(text.indexOf("agent-2"));
  });
  it("concurrent appends are all preserved (no lost updates)", async () => {
    const c = await env.connect();
    await Promise.all(
      Array.from({ length: 12 }, (_, i) => call(c, "handoff_update", { file: "DECISIONS", mode: "append", agent: "p", content: `decision-${i}` })),
    );
    const text = (await call(c, "handoff_read", { file: "DECISIONS" })).json.files[0].content as string;
    for (let i = 0; i < 12; i++) expect(text).toMatch(new RegExp(`^decision-${i}$`, "m"));
  });
  it("generic file tools cannot touch handoff files (any casing)", async () => {
    const c = await env.connect();
    for (const p of ["PROJECT_STATE.md", "plan_log.md"]) {
      expect((await call(c, "write_file", { path: p, content: "x", overwrite: true })).text).toMatch(/handoff_update/);
      expect((await call(c, "str_replace", { path: p, old_str: "#", new_str: "x" })).isError).toBe(true);
      expect((await call(c, "delete_file", { path: p, confirm: true })).isError).toBe(true);
    }
  });
  it("tail_lines limits output and a deleted file is re-seeded", async () => {
    const c = await env.connect();
    const r = await call(c, "handoff_read", { file: "DECISIONS", tail_lines: 3 });
    expect(r.json.files[0].truncated).toBe(true);
    await fs.rm(path.join(env.workspace, "CHECKPOINTS.md"));
    expect((await call(c, "handoff_read", { file: "CHECKPOINTS" })).json.files[0].content).toContain("# CHECKPOINTS");
  });
});
