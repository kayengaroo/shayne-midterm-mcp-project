import fs from "node:fs/promises";
import path from "node:path";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { call, createTestEnv, type TestEnv } from "./helpers.js";

let env: TestEnv;
beforeAll(async () => {
  env = await createTestEnv();
  await fs.mkdir(path.join(env.workspace, "src"));
  await fs.writeFile(path.join(env.workspace, "a.txt"), "hello");
  await fs.writeFile(path.join(env.workspace, "src", "b.ts"), "x");
  await fs.writeFile(path.join(env.workspace, ".env"), "SECRET=1");
});
afterAll(() => env.cleanup());

describe("server basics", () => {
  it("discovers tools through a real MCP client", async () => {
    const client = await env.connect();
    const { tools } = await client.listTools();
    expect(tools.map((t) => t.name)).toContain("list_files");
  });
  it("rejects missing/wrong token with 401 and serves /health publicly", async () => {
    const noAuth = await fetch(env.url, { method: "POST" });
    expect(noAuth.status).toBe(401);
    await expect(env.connect("wrong-token-wrong-token")).rejects.toThrow();
    const health = await fetch(env.url.replace("/mcp", "/health"));
    expect(await health.text()).toBe("ok");
  });
  it("returns 400 (not a stack trace) for malformed JSON", async () => {
    const res = await fetch(env.url, {
      method: "POST",
      headers: { Authorization: "Bearer test-token-1234567890abcdef", "Content-Type": "application/json" },
      body: "{not json",
    });
    expect(res.status).toBe(400);
    expect(await res.text()).not.toMatch(/at .*\.js|node_modules/);
  });
});

describe("list_files", () => {
  it("lists the root and hides .env", async () => {
    const client = await env.connect();
    const r = await call(client, "list_files");
    expect(r.isError).toBe(false);
    const names = r.json.entries.map((e: any) => e.path);
    expect(names).toEqual(expect.arrayContaining(["a.txt", "src"]));
    expect(names).not.toContain(".env");
  });
  it("lists recursively and honours max_entries", async () => {
    const client = await env.connect();
    const all = await call(client, "list_files", { recursive: true });
    expect(all.json.entries.map((e: any) => e.path)).toContain(path.join("src", "b.ts"));
    const capped = await call(client, "list_files", { recursive: true, max_entries: 1 });
    expect(capped.json.entries).toHaveLength(1);
    expect(capped.json.truncated).toBe(true);
  });
  it("returns isError for traversal, missing dirs and files", async () => {
    const client = await env.connect();
    expect((await call(client, "list_files", { path: "../" })).isError).toBe(true);
    expect((await call(client, "list_files", { path: "nope" })).text).toMatch(/not found/i);
    expect((await call(client, "list_files", { path: "a.txt" })).text).toMatch(/Not a directory/);
  });
  it("rejects invalid input via zod (wrong type, unknown key, out of range)", async () => {
    const client = await env.connect();
    for (const bad of [{ path: 5 }, { bogus: 1 }, { max_entries: 0 }, { max_entries: 99999 }]) {
      const r = await client.callTool({ name: "list_files", arguments: bad }).then(
        (x) => ({ isError: Boolean(x.isError) }),
        () => ({ isError: true }),
      );
      expect(r.isError).toBe(true);
    }
  });
});
