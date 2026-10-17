import type { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { listFiles } from "./list-files.js";
import { registerTool, type ToolContext } from "./helper.js";

/** Add new tools to this list; nothing else needs to change. */
export function registerAllTools(server: McpServer, ctx: ToolContext): void {
  registerTool(server, ctx, listFiles);
}
