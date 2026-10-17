# Security

Goal: an agent (or anyone holding the token) can work **only** inside `WORKSPACE_ROOT`, cannot run commands, and cannot easily destroy data or read secrets.

## Threat model and mitigations
| Threat | Mitigation | Where | Test |
|---|---|---|---|
| Path traversal (`../x`, `a/../../x`) | Resolve against root, then check with `path.relative` (not a string prefix: a sibling folder `ws-evil` would defeat `startsWith(root)`) | `sandbox.ts` | `sandbox.test.ts` |
| Absolute paths (`/etc/passwd`) | Rejected outright | `sandbox.ts` | sandbox + tools tests |
| Symlink escape (dir, file, new file through a link, dangling link) | `realpath` of the deepest existing ancestor; result must still be inside the real root; dangling links refused; symlinks never followed by list/search | `sandbox.ts`, `list-files.ts`, `search-files.ts` | `sandbox.test.ts`, tools test |
| Unauthenticated access | Bearer token on `/mcp`, constant-time comparison (SHA-256 of both sides + `timingSafeEqual`); 401 otherwise; `/health` leaks nothing | `server.ts` | `list-files.test.ts` |
| Secret leakage | `.env*` and `.git` blocked and hidden in every tool; logs live outside the workspace; config errors never print values; `.env` is gitignored | `sandbox.ts`, `config.ts` | tools + git tests |
| Accidental deletion | `confirm=true` required, soft delete to `.trash/`, only files, handoff files protected | `delete-file.ts` | tools test |
| Accidental overwrite / lost updates | `overwrite` flag, `if_version` check, atomic temp-file + rename, handoff `PROJECT_STATE` needs `if_version`, logs append-only | `write-file.ts`, `handoff.ts` | tools + handoff tests |
| Oversized input/output | `MAX_FILE_BYTES`, JSON body limit, `max_lines`/`max_results`/`max_entries`/`max_bytes` caps | all tools, `server.ts` | tools test |
| Malformed requests | zod `strictObject` on every tool; malformed JSON -> clean 400 | tools, `server.ts` | tools + server tests |
| Command injection | No shell anywhere. Git runs via `execFile` with fixed subcommands; client text is only ever an argument value after `--` or `-m`; hooks and user/system git config disabled | `git.ts` | `git.test.ts` (injection test) |
| Information disclosure in errors | `ToolError` messages are written to be safe; filesystem errors mapped to short text; unknown errors -> "Internal error" (stack only in `logs/server.log`); git errors have the workspace path replaced | `helper.ts`, `git.ts` | tools test |
| Agents overwriting each other's handoff | Generic write/edit/delete refuse handoff files (any casing); per-file lock for appends | `guards.ts`, `handoff.ts` | handoff test |
| Public admin surface | None exists: only `/health` and `/mcp`; server binds to 127.0.0.1 and is reached only through the tunnel | `server.ts` | pm2 / curl check |

## Auditing
Every tool call is appended to `logs/calls.jsonl` (time, session id, tool, shortened arguments, ok/error, duration). File contents are not logged (strings are cut to 120 chars).

## Residual risks (honest list)
- **TOCTOU symlink race:** between `resolve()` and the file operation, a symlink could be swapped. Exploiting it needs another process able to write inside the workspace; the tools themselves cannot create symlinks.
- **Regex DoS:** `search_files` caps regex length (200) and line length (500) but JavaScript regexes can still be slow on adversarial patterns; a crafted pattern could stall the single process.
- **Single static token:** anyone with it has full workspace access; rotate by changing `.env` and `pm2 restart mcp-file-server --update-env`. No rate limiting, no per-user identity, no OAuth.
- **Tunnel provider** (ngrok) can see traffic; the token travels in a header over HTTPS.
- **Only `.env*`/`.git` are treated as secret.** Other secrets an agent writes into the workspace are readable by the agent.
- **Resource use:** sessions and `.trash/` are not garbage-collected; no disk quota.
- **No DNS-rebinding/Origin check:** mitigated by the required token and loopback binding, not by Host/Origin validation.
