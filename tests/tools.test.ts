import fs from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import type { Client } from "@modelcontextprotocol/sdk/client/index.js";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { call, createTestEnv, type TestEnv } from "./helpers.js";

let env: TestEnv;
let c: Client;
let outsideDir: string;
beforeAll(async () => {
  env = await createTestEnv({ MAX_FILE_BYTES: "2000" });
  c = await env.connect();
  outsideDir = await fs.mkdtemp(path.join(os.tmpdir(), "outside-"));
  await fs.writeFile(path.join(outsideDir, "secret.txt"), "TOP SECRET");
  await fs.symlink(outsideDir, path.join(env.workspace, "escape"));
});
afterAll(async () => {
  await env.cleanup();
  await fs.rm(outsideDir, { recursive: true, force: true });
});

const rejectedInput = async (name: string, args: Record<string, unknown>) =>
  client_call(name, args);
async function client_call(name: string, args: Record<string, unknown>) {
  // zod failures surface either as isError results or as protocol errors depending on SDK version
  try {
    const r = await call(c, name, args);
    return r.isError;
  } catch {
    return true;
  }
}

describe("discovery", () => {
  it("registers at least 8 tools, each with a description and a strict object schema", async () => {
    const { tools } = await c.listTools();
    expect(tools.length).toBeGreaterThanOrEqual(8);
    for (const t of tools) {
      expect(t.description && t.description.length > 30).toBe(true);
      expect(t.inputSchema.type).toBe("object");
      expect((t.inputSchema as any).additionalProperties).toBe(false);
    }
    expect(tools.map((t) => t.name)).toEqual(
      expect.arrayContaining(["list_files", "read_file", "write_file", "str_replace", "delete_file", "search_files", "git_status", "git_diff", "git_log", "git_commit", "handoff_read", "handoff_update"]),
    );
  });
});

describe("write_file / read_file", () => {
  it("creates, reads back (with version), and creates parent dirs", async () => {
    const w = await call(c, "write_file", { path: "notes/a.txt", content: "line1\nline2\nline3\n" });
    expect(w.json).toMatchObject({ path: path.join("notes", "a.txt"), created: true, bytes: 18 });
    const r = await call(c, "read_file", { path: "notes/a.txt" });
    expect(r.json.content).toBe("line1\nline2\nline3");
    expect(r.json.version).toBe(w.json.version);
    expect(r.json.total_lines).toBe(3);
  });
  it("reads ranges and reports truncation", async () => {
    const r = await call(c, "read_file", { path: "notes/a.txt", start_line: 2, max_lines: 1 });
    expect(r.json).toMatchObject({ content: "line2", start_line: 2, end_line: 2, truncated: true });
  });
  it("refuses to overwrite without overwrite/if_version, allows with them", async () => {
    expect((await call(c, "write_file", { path: "notes/a.txt", content: "x" })).text).toMatch(/already exists/);
    expect((await call(c, "write_file", { path: "notes/a.txt", content: "x", overwrite: true })).isError).toBe(false);
  });
  it("enforces if_version", async () => {
    const v = (await call(c, "read_file", { path: "notes/a.txt" })).json.version;
    await call(c, "write_file", { path: "notes/a.txt", content: "changed", overwrite: true });
    const stale = await call(c, "write_file", { path: "notes/a.txt", content: "mine", if_version: v });
    expect(stale.isError).toBe(true);
    expect(stale.text).toMatch(/Version conflict/);
  });
  it("rejects content over the size limit and oversized files on read", async () => {
    expect((await call(c, "write_file", { path: "big.txt", content: "x".repeat(2001) })).text).toMatch(/too large/);
    await fs.writeFile(path.join(env.workspace, "huge.txt"), "y".repeat(3000));
    expect((await call(c, "read_file", { path: "huge.txt" })).text).toMatch(/too large/);
  });
  it("rejects binary files and missing files with helpful errors", async () => {
    await fs.writeFile(path.join(env.workspace, "bin.dat"), Buffer.from([1, 2, 0, 3]));
    expect((await call(c, "read_file", { path: "bin.dat" })).text).toMatch(/Binary/);
    expect((await call(c, "read_file", { path: "missing.txt" })).text).toMatch(/not found/i);
    expect((await call(c, "read_file", { path: "notes" })).text).toMatch(/Not a regular file/);
  });
  it("leaves no temp files behind", async () => {
    const all = await call(c, "list_files", { recursive: true });
    expect(all.json.entries.map((e: any) => e.path).filter((p: string) => p.endsWith(".tmp"))).toEqual([]);
  });
});

describe("str_replace", () => {
  it("replaces a unique string and returns the new version", async () => {
    await call(c, "write_file", { path: "s.txt", content: "alpha beta gamma" });
    const r = await call(c, "str_replace", { path: "s.txt", old_str: "beta", new_str: "BETA" });
    expect(r.json.replacements).toBe(1);
    expect((await call(c, "read_file", { path: "s.txt" })).json.content).toBe("alpha BETA gamma");
  });
  it("errors on missing and ambiguous matches; replace_all works; $ is literal", async () => {
    await call(c, "write_file", { path: "m.txt", content: "a a a" });
    expect((await call(c, "str_replace", { path: "m.txt", old_str: "zzz", new_str: "x" })).text).toMatch(/not found/);
    expect((await call(c, "str_replace", { path: "m.txt", old_str: "a", new_str: "b" })).text).toMatch(/3 times/);
    const all = await call(c, "str_replace", { path: "m.txt", old_str: "a", new_str: "$&", replace_all: true });
    expect(all.json.replacements).toBe(3);
    expect((await call(c, "read_file", { path: "m.txt" })).json.content).toBe("$& $& $&");
  });
  it("respects if_version and the size limit", async () => {
    await call(c, "write_file", { path: "v.txt", content: "one" });
    const stale = await call(c, "str_replace", { path: "v.txt", old_str: "one", new_str: "two", if_version: "0000000000000000" });
    expect(stale.text).toMatch(/Version conflict/);
    expect((await call(c, "str_replace", { path: "v.txt", old_str: "one", new_str: "z".repeat(2500) })).text).toMatch(/too large/);
  });
});

describe("delete_file", () => {
  it("requires confirm=true", async () => {
    await call(c, "write_file", { path: "d.txt", content: "bye" });
    const r = await call(c, "delete_file", { path: "d.txt", confirm: false });
    expect(r.text).toMatch(/confirm=true/);
    expect((await call(c, "read_file", { path: "d.txt" })).isError).toBe(false);
  });
  it("moves the file to .trash instead of erasing it", async () => {
    const r = await call(c, "delete_file", { path: "d.txt", confirm: true });
    expect(r.json.moved_to).toMatch(/^\.trash/);
    expect((await call(c, "read_file", { path: "d.txt" })).isError).toBe(true);
    expect(await fs.readFile(path.join(env.workspace, r.json.moved_to), "utf8")).toBe("bye");
  });
  it("refuses directories, missing files, trash entries and the root", async () => {
    expect((await call(c, "delete_file", { path: "notes", confirm: true })).text).toMatch(/Only regular files/);
    expect((await call(c, "delete_file", { path: "nope", confirm: true })).text).toMatch(/not found/i);
    expect((await call(c, "delete_file", { path: ".trash/x", confirm: true })).isError).toBe(true);
    expect((await call(c, "delete_file", { path: ".", confirm: true })).isError).toBe(true);
  });
});

describe("search_files", () => {
  beforeAll(async () => {
    await call(c, "write_file", { path: "src/one.ts", content: "const TODO = 1;\nfoo\n// todo: later\n" });
    await call(c, "write_file", { path: "src/two.ts", content: "nothing here\n" });
  });
  it("finds text case-insensitively with line numbers", async () => {
    const r = await call(c, "search_files", { query: "todo", path: "src" });
    expect(r.json.matches).toEqual([
      { path: path.join("src", "one.ts"), line: 1, text: "const TODO = 1;" },
      { path: path.join("src", "one.ts"), line: 3, text: "// todo: later" },
    ]);
  });
  it("supports case-sensitive, regex, caps and invalid regex", async () => {
    expect((await call(c, "search_files", { query: "TODO", case_sensitive: true, path: "src" })).json.matches).toHaveLength(1);
    expect((await call(c, "search_files", { query: "^fo+$", regex: true, path: "src" })).json.matches).toHaveLength(1);
    expect((await call(c, "search_files", { query: "o", path: "src", max_results: 1 })).json.truncated).toBe(true);
    expect((await call(c, "search_files", { query: "(", regex: true })).text).toMatch(/Invalid regular expression/);
  });
  it("does not follow symlinks or reveal secrets", async () => {
    await fs.writeFile(path.join(env.workspace, ".env"), "TOP SECRET=1");
    const r = await call(c, "search_files", { query: "TOP SECRET" });
    expect(r.json.matches).toEqual([]);
    expect((await call(c, "search_files", { query: "x", path: "escape" })).isError).toBe(true);
  });
});

describe("workspace boundary through every path-taking tool", () => {
  const evil = ["../outside.txt", "/etc/passwd", "escape/secret.txt", "notes/../../x", ".env", ".git/config"];
  it.each(evil)("blocks %s", async (p) => {
    expect((await call(c, "read_file", { path: p })).isError).toBe(true);
    expect((await call(c, "write_file", { path: p, content: "pwn", overwrite: true })).isError).toBe(true);
    expect((await call(c, "str_replace", { path: p, old_str: "a", new_str: "b" })).isError).toBe(true);
    expect((await call(c, "delete_file", { path: p, confirm: true })).isError).toBe(true);
    expect((await call(c, "list_files", { path: p })).isError).toBe(true);
    expect((await call(c, "search_files", { query: "a", path: p })).isError).toBe(true);
  });
  it("never wrote anything outside the workspace", async () => {
    expect(await fs.readFile(path.join(outsideDir, "secret.txt"), "utf8")).toBe("TOP SECRET");
    expect(await fs.readdir(outsideDir)).toEqual(["secret.txt"]);
  });
  it("error messages do not leak absolute paths or stack traces", async () => {
    const r = await call(c, "read_file", { path: "../../etc/passwd" });
    expect(r.text).not.toContain(env.workspace);
    expect(r.text).not.toMatch(/\bat\s.+\(|node_modules/);
  });
});

describe("zod validation rejects malformed input", () => {
  it.each([
    ["read_file", {}],
    ["read_file", { path: 123 }],
    ["read_file", { path: "a", extra: true }],
    ["write_file", { path: "a" }],
    ["write_file", { path: "a", content: "x", if_version: "not-hex" }],
    ["str_replace", { path: "a", old_str: "", new_str: "x" }],
    ["delete_file", { path: "a" }],
    ["search_files", { query: "" }],
    ["search_files", { query: "a", max_results: 1000 }],
    ["git_log", { max_count: 0 }],
    ["handoff_update", { file: "NOPE", mode: "append", agent: "a", content: "x" }],
  ])("%s %j", async (name, args) => {
    expect(await rejectedInput(name, args as Record<string, unknown>)).toBe(true);
  });
});

describe("call log", () => {
  it("records tool calls without storing whole file contents", async () => {
    await call(c, "write_file", { path: "logme.txt", content: "q".repeat(1500) });
    const log = await fs.readFile(env.server.logger.file, "utf8");
    const entries = log.trim().split("\n").map((l) => JSON.parse(l));
    const e = entries.reverse().find((x) => x.tool === "write_file");
    expect(e.ok).toBe(true);
    expect(JSON.stringify(e)).toContain("chars)");
    expect(JSON.stringify(e).length).toBeLessThan(600);
  });
});
