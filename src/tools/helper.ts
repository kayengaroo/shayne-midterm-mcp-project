import type { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import type { CallToolResult } from "@modelcontextprotocol/sdk/types.js";
import type { z } from "zod";
import type { Config } from "../config.js";
import { ToolError } from "../errors.js";
import type { CallLogger } from "../logger.js";
import type { Sandbox } from "../sandbox.js";

const FS_MESSAGES: Record<string, string> = {
  ENOENT: "Not found.",
  EISDIR: "Path is a directory.",
  ENOTDIR: "A parent in the path is not a directory.",
  EACCES: "Permission denied.",
  EPERM: "Permission denied.",
  EEXIST: "Already exists.",
  ENOTEMPTY: "Directory is not empty.",
  ENOSPC: "No space left on the server.",
};

/** Everything a tool needs. Passed in explicitly so tests can build their own. */
export interface ToolContext {
  config: Config;
  sandbox: Sandbox;
  logger: CallLogger;
}

export interface ToolDef<T extends z.ZodObject> {
  name: string;
  description: string;
  schema: T;
  /** true = tool never changes anything */
  readOnly: boolean;
  destructive?: boolean;
  handler: (args: z.infer<T>, ctx: ToolContext) => Promise<unknown>;
}

/**
 * Register one tool. The SDK validates input against the zod schema BEFORE the handler runs.
 * This wrapper adds: JSON result format, logging, and safe errors (isError, no stack traces).
 */
export function registerTool<T extends z.ZodObject>(
  server: McpServer,
  ctx: ToolContext,
  def: ToolDef<T>,
): void {
  server.registerTool(
    def.name,
    {
      description: def.description,
      inputSchema: def.schema,
      annotations: {
        readOnlyHint: def.readOnly,
        destructiveHint: def.destructive ?? false,
        idempotentHint: def.readOnly,
        openWorldHint: false,
      },
    },
    // Cast: the SDK's callback type is generic over the schema; we validate/unwrap ourselves.
    (async (args: unknown, extra: { sessionId?: string }): Promise<CallToolResult> => {
      const started = Date.now();
      try {
        const result = await def.handler(args as z.infer<T>, ctx);
        ctx.logger.logCall({ session: extra.sessionId, tool: def.name, args, ok: true, ms: Date.now() - started });
        return { content: [{ type: "text", text: JSON.stringify(result, null, 2) }] };
      } catch (err) {
        let message = "Internal error. The failure was logged on the server.";
        const code = (err as NodeJS.ErrnoException | undefined)?.code;
        if (err instanceof ToolError) message = err.message;
        else if (typeof code === "string" && FS_MESSAGES[code]) message = FS_MESSAGES[code]!;
        else ctx.logger.logInternal(`tool ${def.name} crashed`, err);
        ctx.logger.logCall({ session: extra.sessionId, tool: def.name, args, ok: false, ms: Date.now() - started, error: message });
        return { isError: true, content: [{ type: "text", text: `Error: ${message}` }] };
      }
    }) as never,
  );
}
