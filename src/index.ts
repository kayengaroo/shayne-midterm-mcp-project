import "dotenv/config";
import { loadConfig } from "./config.js";
import { startServer } from "./server.js";

async function main(): Promise<void> {
  const config = loadConfig();
  const server = await startServer(config);
  console.log(`MCP file server listening on http://${config.host}:${server.port}/mcp`);
  console.log(`Workspace root: ${server.sandbox.root}`);

  const shutdown = async (signal: string): Promise<void> => {
    console.log(`${signal} received, shutting down...`);
    await server.close();
    process.exit(0);
  };
  process.on("SIGINT", () => void shutdown("SIGINT"));
  process.on("SIGTERM", () => void shutdown("SIGTERM"));
}

main().catch((err) => {
  // Config errors never contain secret values.
  console.error(err instanceof Error ? err.message : err);
  process.exit(1);
});
