import fs from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { Sandbox } from "../src/sandbox.js";

let dir: string;
let outside: string;
let sb: Sandbox;

beforeAll(async () => {
  dir = await fs.mkdtemp(path.join(os.tmpdir(), "sandbox-test-"));
  outside = path.join(dir, "outside");
  await fs.mkdir(outside);
  await fs.writeFile(path.join(outside, "secret.txt"), "top secret");
  const root = path.join(dir, "ws");
  // A sibling dir whose name starts with the root name: breaks naive string-prefix checks.
  await fs.mkdir(path.join(dir, "ws-evil"));
  sb = await Sandbox.create(root);
  await fs.mkdir(path.join(sb.root, "sub"));
  await fs.symlink(outside, path.join(sb.root, "link-dir"));
  await fs.symlink(path.join(outside, "secret.txt"), path.join(sb.root, "link-file"));
  await fs.symlink(path.join(outside, "nope.txt"), path.join(sb.root, "dangling"));
  await fs.symlink(path.join(sb.root, "sub"), path.join(sb.root, "link-inside"));
});
afterAll(() => fs.rm(dir, { recursive: true, force: true }));

describe("Sandbox.resolve", () => {
  it("accepts normal, nested, new and root paths", async () => {
    expect((await sb.resolve("a.txt")).abs).toBe(path.join(sb.root, "a.txt"));
    expect((await sb.resolve("sub/new/deep.txt")).rel).toBe(path.join("sub", "new", "deep.txt"));
    expect((await sb.resolve(".")).rel).toBe("");
    expect((await sb.resolve("sub/../a.txt")).rel).toBe("a.txt");
  });
  it.each(["..", "../x", "sub/../../x", "../ws-evil/x", "a/../../../etc/passwd"])("rejects traversal %s", async (p) => {
    await expect(sb.resolve(p)).rejects.toThrow(/escapes/);
  });
  it("rejects absolute paths and NUL bytes", async () => {
    await expect(sb.resolve("/etc/passwd")).rejects.toThrow(/Absolute/);
    await expect(sb.resolve(path.join(sb.root, "a.txt"))).rejects.toThrow(/Absolute/);
    await expect(sb.resolve("a\0b")).rejects.toThrow(/Invalid/);
  });
  it("rejects symlink escapes (dir, file, nested, new file via link, dangling)", async () => {
    await expect(sb.resolve("link-dir")).rejects.toThrow(/symlink/);
    await expect(sb.resolve("link-dir/secret.txt")).rejects.toThrow(/symlink/);
    await expect(sb.resolve("link-file")).rejects.toThrow(/symlink/);
    await expect(sb.resolve("link-dir/new.txt")).rejects.toThrow(/symlink/);
    await expect(sb.resolve("dangling")).rejects.toThrow(/Broken symlink/);
  });
  it("allows symlinks that stay inside the workspace", async () => {
    expect((await sb.resolve("link-inside/x.txt")).rel).toBe(path.join("sub", "x.txt"));
  });
  it("blocks .git and .env files", async () => {
    await expect(sb.resolve(".env")).rejects.toThrow(/blocked/);
    await expect(sb.resolve(".env.local")).rejects.toThrow(/blocked/);
    await expect(sb.resolve("sub/.git/config")).rejects.toThrow(/blocked/);
  });
});
