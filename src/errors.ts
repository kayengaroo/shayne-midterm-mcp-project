/** An error whose message is safe to show to the MCP client (no paths outside workspace, no stack). */
export class ToolError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "ToolError";
  }
}
