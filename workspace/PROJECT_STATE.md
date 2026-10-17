# PROJECT_STATE
_Single source of truth. Overwrite the sections below; keep it short. Last updated: M1 complete._

## Goal
Sandboxed MCP file-server connector (Node + TS SDK + Streamable HTTP + zod), HTTPS via ngrok, kept alive by pm2, with a 4-file handoff protocol.

## Status
- Milestone: **M1 done** (skeleton + list_files + sandbox). Next: **M2**.
- Tools registered: list_files (1 of 11 planned).
- Verified: typecheck OK, build OK, 17 vitest tests pass, built server smoke-tested (health, 401, graceful SIGTERM).

## Remaining
- M2: read_file, write_file, str_replace, delete_file, search_files (+ tests)
- M3: pm2 config, ngrok docs, deployment docs
- M4: git_status/git_diff/git_log, handoff_read/handoff_update, write guards
- M5: multi-session test, transcript, 11 docs, final audit, push

## Known issues
- ngrok/pm2/real client (Claude) unverified: cannot run in the dev sandbox.

## Next action
Implement M2 tools in src/tools/, register in src/tools/index.ts, add tests/tools.test.ts.
