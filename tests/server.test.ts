import fs from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { describe, expect, it } from "vitest";
import { loadConfig } from "../src/config.js";
import { startServer } from "../src/server.js";

describe("config", () => {
  it("requires a long token and never echoes it", () => {
    expect(() => loadConfig({})).toThrow(/MCP_AUTH_TOKEN/);
    expect(() => loadConfig({ MCP_AUTH_TOKEN: "short-secret" })).toThrow(/at least 16/);
    try {
      loadConfig({ MCP_AUTH_TOKEN: "short-secret" });
    } catch (e) {
      expect(String(e)).not.toContain("short-secret");
    }
  });
  it("applies defaults and validates numbers", () => {
    const c = loadConfig({ MCP_AUTH_TOKEN: "x".repeat(16) });
    expect(c).toMatchObject({ port: 3000, host: "127.0.0.1", maxFileBytes: 1_000_000 });
    expect(() => loadConfig({ MCP_AUTH_TOKEN: "x".repeat(16), PORT: "abc" })).toThrow(/PORT/);
  });
});

describe("startup and shutdown", () => {
  it("starts, serves /health, and frees the port on close", async () => {
    const dir = await fs.mkdtemp(path.join(os.tmpdir(), "srv-"));
    const server = await startServer(
      loadConfig({ MCP_AUTH_TOKEN: "x".repeat(16), PORT: "0", WORKSPACE_ROOT: path.join(dir, "w"), LOG_DIR: path.join(dir, "l") }),
    );
    const url = `http://127.0.0.1:${server.port}/health`;
    expect(await (await fetch(url)).text()).toBe("ok");
    await server.close();
    await expect(fetch(url)).rejects.toThrow();
    await fs.rm(dir, { recursive: true, force: true });
  });
});
