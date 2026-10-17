# CHECKPOINTS
_Append-only. A checkpoint = a verified, resumable point. Include the git commit and how to verify._

## CP1 - M1 skeleton
- Commit: "M1: skeleton, sandbox, list_files"
- Verify: `npm run typecheck && npm test && npm run build`
- Result: 17 tests pass.
- Resume from: M2 in PLAN_LOG.

## CP2 - M2+M4 tools complete
- Commit: "M2+M4: file tools, search, git-lite, handoff tools, tests". Verify: `npm test` -> 69 passed at that point.

## CP3 - final
- Commit: "M5: final audit". Verify: `npm run typecheck && npm test && npm run build` -> 71 tests pass.
- Also verified: Inspector CLI, pm2 crash recovery. Unverified: ngrok, real LLM client.
- Resume from: PROJECT_STATE "Remaining".
