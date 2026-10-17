# DECISIONS
_Append-only. Format: `D<n> [date] decision - reason`._

- D1: Reference stack (Node, TS SDK, Streamable HTTP, zod, ngrok, pm2) - best documented, easy to justify.
- D2: Stateful sessions (Mcp-Session-Id), one McpServer per session - makes the 2-session test meaningful.
- D3: Bearer token auth is MANDATORY (PDF lists it as stretch, but Rubric E needs a secret on the public endpoint).
- D4: Absolute paths are rejected outright; relative paths are resolved then checked with path.relative + realpath (no string-prefix checks).
- D5: `.git` and `.env*` are blocked/hidden from all file tools.
- D6: Tool errors return isError with a short message; stack traces go only to logs/server.log.
- D7: Every tool call is logged to logs/calls.jsonl (args truncated) - source for the demo transcript.
- D8: Delete will be soft (move to .trash/) and require confirm:true (M2).
