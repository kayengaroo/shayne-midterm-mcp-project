import type { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { deleteFile } from "./delete-file.js";
import { gitCommit, gitDiff, gitLog, gitStatus } from "./git.js";
import { handoffRead, handoffUpdate } from "./handoff.js";
import { registerTool, type ToolContext } from "./helper.js";
import { listFiles } from "./list-files.js";
import { readFile } from "./read-file.js";
import { searchFiles } from "./search-files.js";
import { strReplace } from "./str-replace.js";
import { writeFile } from "./write-file.js";

/** Add new tools to this list; nothing else needs to change. */
export function registerAllTools(server: McpServer, ctx: ToolContext): void {
  registerTool(server, ctx, listFiles);
  registerTool(server, ctx, readFile);
  registerTool(server, ctx, writeFile);
  registerTool(server, ctx, strReplace);
  registerTool(server, ctx, deleteFile);
  registerTool(server, ctx, searchFiles);
  registerTool(server, ctx, gitStatus);
  registerTool(server, ctx, gitDiff);
  registerTool(server, ctx, gitLog);
  registerTool(server, ctx, gitCommit);
  registerTool(server, ctx, handoffRead);
  registerTool(server, ctx, handoffUpdate);
}
