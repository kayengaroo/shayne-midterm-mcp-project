# Handoff protocol

**Problem:** an agent session ends (context limit, new day, different agent) and the next one knows nothing. **Solution:** four files in the workspace root that carry context. A new agent starts with `handoff_read` and can continue with no chat history. (Demonstrated by `multisession.test.ts` and [demo-transcript.md](demo-transcript.md); sample outputs in `docs/demo/`.)

| File | Type | Contents | Update rule |
|---|---|---|---|
| `PROJECT_STATE.md` | **snapshot** | Goal, Status, Completed, Remaining, Known issues, **Next action** | `handoff_update mode=replace` with `if_version` (from `handoff_read`). Rewrite the whole file, keep it short. |
| `PLAN_LOG.md` | **append-only** | Planned/finished steps: what, who, outcome | `mode=append` |
| `CHECKPOINTS.md` | **append-only** | Verified resumable points: what is done, how verified, git commit | `mode=append` |
| `DECISIONS.md` | **append-only** | Decisions and reasons; supersede by adding a new entry | `mode=append` |

Appended entries look like `### 2026-10-17T04:12:20.059Z | planner` followed by the text, so every entry shows who wrote it and when.

## Agent routine
1. **Start:** `handoff_read` (all). Read Next action and the tail of the logs.
2. **Work:** small steps; `git_commit` after meaningful progress.
3. **After each milestone:** append to `PLAN_LOG`; append to `CHECKPOINTS` (include the commit hash); append to `DECISIONS` if a choice was made.
4. **End of session:** `handoff_update` replace `PROJECT_STATE` (Status, Remaining, Next action).

## Safety rules (enforced by code)
- `PROJECT_STATE` replace **requires** `if_version`; if another agent changed it meanwhile you get "Version conflict" and must re-read and merge. This prevents silent overwrites.
- Log files cannot be replaced (history is never rewritten).
- Appends to the same file are serialized by an in-process lock; the test fires 12 at once and all survive. (Lock is per process: run one server instance. Writes are atomic via rename.)
- `write_file`, `str_replace` and `delete_file` refuse handoff files, in any letter case.
- Deleted/missing handoff files are re-created from `templates/handoff/`.

## Two sets of handoff files
- **Runtime** (in `workspace/`): used by agents that use the server; seeded from `templates/handoff/`.
- **Development** (repo root): `PROJECT_STATE.md`, `PLAN_LOG.md`, `CHECKPOINTS.md`, `DECISIONS.md` record how this project was built; use them to resume development in a new AI conversation.
