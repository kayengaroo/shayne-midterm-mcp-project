# PROJECT_STATE
_Development handoff for this repo. Last updated: all milestones complete._

## Goal
Sandboxed MCP file-server connector (Node + TS SDK + Streamable HTTP + zod), HTTPS via ngrok, pm2, 4-file handoff protocol.

## Status
- **M1-M5 complete.** 12 tools, sandbox, auth, logging, pm2 config, handoff tools, git-lite, 11 docs + README, demo transcript.
- Verified in dev sandbox: typecheck, build, **71/71 tests**, MCP Inspector CLI (tools/list, success, isError), pm2 (start, kill -9 recovery, restart, graceful stop), `npm run demo` (2 sessions, 18 calls).

## Remaining (needs the student, not possible in the dev sandbox)
- Push to GitHub (see commands in chat / README).
- Run ngrok with a static domain; verify `curl https://<domain>/health` and 401 on /mcp.
- Run the multi-step task with a REAL LLM client (e.g. Claude Code) through the tunnel; save its transcript (replace/add to docs/demo-transcript.md).
- Prepare the 5-minute live demo and the short report (content exists in docs/architecture.md and docs/security.md).

## Known issues / limits
- ngrok, real LLM client, `pm2 startup`, Windows/macOS: unverified.
- claude.ai custom connectors need OAuth (not implemented); use Claude Code or Inspector.
- Residual risks listed in docs/security.md (TOCTOU symlink race, regex DoS, single token, no rate limit).

## Next action
Student: push repo, set up ngrok, run real-client demo (docs/testing.md "Suggested real-client task").
