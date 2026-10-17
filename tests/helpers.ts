import fs from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { Client } from "@modelcontextprotocol/sdk/client/index.js";
import { StreamableHTTPClientTransport } from "@modelcontextprotocol/sdk/client/streamableHttp.js";
import { loadConfig } from "../src/config.js";
import { startServer, type RunningServer } from "../src/server.js";

export const TOKEN = "test-token-1234567890abcdef";

export interface TestEnv {
  dir: string;
  workspace: string;
  server: RunningServer;
  url: string;
  connect: (token?: string) => Promise<Client>;
  cleanup: () => Promise<void>;
}

/** Real server on a random port, inside a temp dir. Never touches real user files. */
export async function createTestEnv(extra: Record<string, string> = {}): Promise<TestEnv> {
  const dir = await fs.mkdtemp(path.join(os.tmpdir(), "mcp-test-"));
  const workspace = path.join(dir, "workspace");
  const config = loadConfig({
    MCP_AUTH_TOKEN: TOKEN,
    PORT: "0",
    WORKSPACE_ROOT: workspace,
    LOG_DIR: path.join(dir, "logs"),
    ...extra,
  });
  const server = await startServer(config);
  const url = `http://127.0.0.1:${server.port}/mcp`;
  const clients: Client[] = [];
  return {
    dir,
    workspace: server.sandbox.root,
    server,
    url,
    async connect(token = TOKEN) {
      const client = new Client({ name: "test-client", version: "1.0.0" });
      await client.connect(
        new StreamableHTTPClientTransport(new URL(url), {
          requestInit: { headers: { Authorization: `Bearer ${token}` } },
        }),
      );
      clients.push(client);
      return client;
    },
    async cleanup() {
      await Promise.all(clients.map((c) => c.close().catch(() => undefined)));
      await server.close();
      await fs.rm(dir, { recursive: true, force: true });
    },
  };
}

/** Call a tool and return {isError, text, json?}. */
export async function call(client: Client, name: string, args: Record<string, unknown> = {}) {
  const res = await client.callTool({ name, arguments: args });
  const text = (res.content as Array<{ type: string; text: string }>)[0]?.text ?? "";
  let json: any;
  try {
    json = JSON.parse(text);
  } catch {
    /* error text is not JSON */
  }
  return { isError: Boolean(res.isError), text, json };
}
