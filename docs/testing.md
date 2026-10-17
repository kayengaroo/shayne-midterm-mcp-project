# Testing

`npm test` runs **70 automated tests** in 7 files. Each uses a temporary directory and a real server on a random port; clients are the official MCP SDK client, so the real protocol is exercised (no mocks). Real user files are never touched.

| File | Tests | Covers |
|---|---|---|
| `sandbox.test.ts` | 10 | `..`, sibling-prefix trick, absolute paths, NUL, 4 kinds of symlink escape, allowed inner symlink, `.git`/`.env` |
| `list-files.test.ts` | 8 | tool discovery, 401 for missing/wrong token, public `/health`, 404 for stale session, malformed JSON -> 400 without stack, list/recursive/caps, zod rejection |
| `tools.test.ts` | 37 | schemas of all tools (strict objects, descriptions), write/read/ranges/overwrite/`if_version`/size limit/binary/missing, `str_replace` edge cases, delete gate + `.trash`, search, **6 hostile paths x 6 tools**, no leaks of absolute paths, 11 malformed-input cases, call-log content |
| `git.test.ts` | 5 | auto-init, status/diff/commit/log, nothing-to-commit, shell/option injection attempt, git path sandboxing |
| `handoff.test.ts` | 6 | seeding, `if_version` conflict, append-only + attribution, 12 concurrent appends all kept, generic tools blocked, tail + re-seeding |
| `server.test.ts` | 3 | config validation (no secret echo), startup, health, port freed on shutdown |
| `multisession.test.ts` | 1 | Session 1 -> server **restart** -> Session 2 (new session id) continues from handoff files only; git history and logs checked |

## Commands that were actually run (in the development sandbox, Node 22)
| Check | Result |
|---|---|
| `npm run typecheck` | passed |
| `npm run build` | passed |
| `npm test` | **70 / 70 passed** |
| `npm run demo` | 18 tool calls over 2 sessions; 2 intentional errors (traversal, missing confirm); output in [demo-transcript.md](demo-transcript.md) |
| **MCP Inspector CLI** (`npx @modelcontextprotocol/inspector --cli ... --transport http`) against the built server | `tools/list` returned 12 tools; `write_file` succeeded; `read_file ../../etc/passwd` returned `isError` "Path escapes the workspace root." |
| **pm2** (`pm2 start ecosystem.config.cjs`) | started; `kill -9` -> pm2 restarted it with a new pid and `/health` answered again; `pm2 restart` OK; `pm2 stop` triggered the graceful-shutdown log line; token absent from pm2 logs; `/mcp` gave 401 without a token and 200 on `initialize` with it (curl) |

## NOT verified (you must run these; I had no access)
- **ngrok tunnel / public HTTPS URL.** Follow [deployment.md](deployment.md), then run `DEMO_URL=https://<domain>/mcp DEMO_TOKEN=<token> npm run demo`.
- **A real LLM-based MCP client** (e.g. Claude Code) doing the multi-step task. The included transcript comes from a *scripted* SDK client; for the course demo, repeat the task with a real client (suggested prompt below) and save its tool-call transcript.
- `pm2 startup` (boot persistence) and Windows/macOS behaviour (developed and tested on Linux).

Suggested real-client task: *"Use the file-server. First read the handoff files. Create notes/todo.md with 3 items and a scratch file, commit, record progress in PLAN_LOG and PROJECT_STATE. Then in a NEW session read the handoff files, tick one item, delete the scratch file, commit, and update the handoff files."*

## Manual MCP Inspector (UI) run
`npx @modelcontextprotocol/inspector`, choose **Streamable HTTP**, URL `http://127.0.0.1:3000/mcp`, add header `Authorization: Bearer <token>`, Connect, List Tools, call `list_files`.
