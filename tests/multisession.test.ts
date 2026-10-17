import fs from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { Client } from "@modelcontextprotocol/sdk/client/index.js";
import { StreamableHTTPClientTransport } from "@modelcontextprotocol/sdk/client/streamableHttp.js";
import { afterAll, describe, expect, it } from "vitest";
import { loadConfig } from "../src/config.js";
import { startServer } from "../src/server.js";
import { call, TOKEN } from "./helpers.js";

const dir = await fs.mkdtemp(path.join(os.tmpdir(), "multi-"));
const config = () => loadConfig({ MCP_AUTH_TOKEN: TOKEN, PORT: "0", WORKSPACE_ROOT: path.join(dir, "w"), LOG_DIR: path.join(dir, "l") });
afterAll(() => fs.rm(dir, { recursive: true, force: true }));

async function connect(port: number): Promise<{ client: Client; sessionId: string }> {
  const transport = new StreamableHTTPClientTransport(new URL(`http://127.0.0.1:${port}/mcp`), {
    requestInit: { headers: { Authorization: `Bearer ${TOKEN}` } },
  });
  const client = new Client({ name: "agent", version: "1.0.0" });
  await client.connect(transport);
  return { client, sessionId: transport.sessionId! };
}

describe("multi-step task across sessions and a server restart", () => {
  it("session 2 (new client, new server process state) continues using only the handoff files", async () => {
    // ---- Session 1: plan + start the work, then hand off ----
    let server = await startServer(config());
    const s1 = await connect(server.port);
    const state1 = (await call(s1.client, "handoff_read", { file: "PROJECT_STATE" })).json.files[0];
    await call(s1.client, "write_file", { path: "todo.md", content: "- [ ] write intro\n- [ ] write summary\n- [ ] scratch\n" });
    await call(s1.client, "write_file", { path: "scratch.txt", content: "temp" });
    await call(s1.client, "handoff_update", { file: "PLAN_LOG", mode: "append", agent: "agent-1", content: "Created todo.md with 3 items." });
    await call(s1.client, "handoff_update", {
      file: "PROJECT_STATE", mode: "replace", agent: "agent-1", if_version: state1.version,
      content: "# PROJECT_STATE\n## Status\ntodo.md created; 0/3 done\n## Next action\nTick items in todo.md, delete scratch.txt, then checkpoint.\n",
    });
    expect((await call(s1.client, "git_commit", { message: "session 1 work" })).isError).toBe(false);
    await s1.client.close();
    await server.close(); // simulate restart (pm2 would do this)

    // ---- Session 2: fresh process + fresh MCP session; no chat history, only files ----
    server = await startServer(config());
    const s2 = await connect(server.port);
    expect(s2.sessionId).not.toBe(s1.sessionId);

    const ctx = (await call(s2.client, "handoff_read")).json.files as Array<{ file: string; content: string; version: string }>;
    const state = ctx.find((f) => f.file === "PROJECT_STATE")!;
    expect(state.content).toContain("todo.md created; 0/3 done");
    expect(ctx.find((f) => f.file === "PLAN_LOG")!.content).toContain("agent-1");

    const found = await call(s2.client, "search_files", { query: "[ ]", path: "." });
    expect(found.json.matches).toHaveLength(3);
    await call(s2.client, "str_replace", { path: "todo.md", old_str: "- [ ] write intro", new_str: "- [x] write intro" });
    await call(s2.client, "delete_file", { path: "scratch.txt", confirm: true });
    expect((await call(s2.client, "git_status")).json.entries.length).toBeGreaterThan(0);
    expect((await call(s2.client, "git_diff", { path: "todo.md" })).json.diff).toContain("+- [x] write intro");
    await call(s2.client, "git_commit", { message: "session 2 work" });
    await call(s2.client, "handoff_update", { file: "CHECKPOINTS", mode: "append", agent: "agent-2", content: "1/3 done; commit recorded." });
    await call(s2.client, "handoff_update", {
      file: "PROJECT_STATE", mode: "replace", agent: "agent-2", if_version: state.version,
      content: "# PROJECT_STATE\n## Status\n1/3 done\n",
    });

    const log = (await call(s2.client, "git_log")).json.commits.map((c: any) => c.subject);
    expect(log.slice(0, 3)).toEqual(["session 2 work", "session 1 work", "Initialize workspace"]);
    expect((await call(s2.client, "read_file", { path: "todo.md" })).json.content).toContain("[x] write intro");
    await s2.client.close();
    await server.close();

    // calls from both sessions are in the log under different session ids
    const entries = (await fs.readFile(path.join(dir, "l", "calls.jsonl"), "utf8")).trim().split("\n").map((l) => JSON.parse(l));
    expect(new Set(entries.map((e) => e.session)).size).toBe(2);
  });
});
