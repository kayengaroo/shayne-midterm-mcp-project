# Architecture

## Overview
```
MCP client ──HTTPS──> ngrok (static domain) ──> 127.0.0.1:PORT  Express
                                                   ├─ GET /health          (public, returns "ok")
                                                   └─ /mcp  [bearer-token middleware]
                                                        └─ StreamableHTTPServerTransport (1 per session)
                                                             └─ McpServer (1 per session) ── 12 tools
                                                                    └─ Sandbox.resolve() ── workspace/
```
| File | Responsibility |
|---|---|
| `src/index.ts` | entry point: load `.env`, start, handle SIGINT/SIGTERM |
| `src/config.ts` | validate environment with zod (never echoes secrets) |
| `src/server.ts` | Express app, auth, session/transport wiring, graceful close |
| `src/sandbox.ts` | **the only place paths are trusted**: `Sandbox.resolve()` |
| `src/logger.ts` | JSONL call log + internal error log |
| `src/git.ts` | `runGit()`: `execFile` without a shell, fixed args |
| `src/workspace-init.ts` | seed handoff files from `templates/handoff/`, `git init` |
| `src/tools/*.ts` | one tool per file (schema + handler); `helper.ts` wraps each tool; `index.ts` registers them |

## How a tool call flows
1. Request hits `/mcp` -> auth middleware checks the bearer token.
2. The SDK routes it to the session's `McpServer`, which **validates arguments against the tool's zod schema**; invalid input never reaches the handler.
3. `registerTool` wrapper runs the handler, logs the call, and converts any failure into `{isError:true, text:"Error: ..."}`. Expected problems throw `ToolError` (safe message); filesystem codes map to short messages; anything else is logged with its stack in `logs/server.log` and the client only sees "Internal error".
4. Handlers call `sandbox.resolve(path)` before touching the disk.

## Stack choices and justification
| Layer | Choice | Why (and the trade-off) |
|---|---|---|
| Runtime/SDK | Node.js + official TypeScript MCP SDK | Reference stack; SDK tracks the spec; same language as the schemas (zod). Trade-off: Node memory use vs a compiled language. |
| Transport | Streamable HTTP | Works through a tunnel to a remote client (stdio only works locally). Stateful sessions (`Mcp-Session-Id`) make "session 1 vs session 2" real. Trade-off: sessions live in memory, so a restart ends them (clients get 404 and re-initialize; durable context lives in handoff files, not sessions). |
| Validation | zod `strictObject` on every tool | Unknown keys are rejected; the same schema becomes the JSON-schema the agent sees. |
| Exposure | ngrok static domain | Free, stable HTTPS URL, no server needed. Trade-off: traffic passes through ngrok; free tier limits. Alternative: Cloudflare Tunnel. |
| Process manager | pm2 | Restart on crash, log files, one command. Trade-off: extra global dependency (systemd/Docker are alternatives). |
| Testing | vitest + real SDK client + MCP Inspector CLI | Tests the real protocol, not mocks. |

## Tool design choices
- **Single-purpose tools with strict schemas** (12 tools) instead of one "do anything" tool: easier for the agent to choose, easier to gate (only `delete_file`, `write_file`, `str_replace`, `handoff_update`, `git_commit` change state).
- **Small outputs:** `read_file` returns line ranges, `search_files`/`list_files` cap results and report `truncated`, so agents don't flood their context.
- **Optimistic locking:** reads return a `version` (content hash); writes may send it back as `if_version`.
- **No shell, no free-form git:** only 4 fixed git operations.
- **Handoff files are first-class** (`handoff_read`/`handoff_update`) and the generic file tools refuse to touch them, so agents can't clobber each other's state.

## Known limitations
Single process (handoff locking is in-process); sessions are in-memory; one static token; no rate limiting; no OAuth. See [security.md](security.md).
