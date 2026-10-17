# Requirements traceability

Source: professor's slides "Midterms Pt 1: Build Your Own" (brief, 6 minimum requirements, stack and milestones, rubric). Status: **Done** = implemented and verified here; **Done (unverified part)** = implemented, but a step needs you to run it.

## Minimum requirements
| # | Requirement | Implementation | Verification | Status |
|---|---|---|---|---|
| 01 | Sandboxed workspace root; every path resolved against it, escapes rejected | `src/sandbox.ts`; every tool calls `resolve()` | `sandbox.test.ts`, 6x6 hostile-path tests in `tools.test.ts`; [security.md](security.md) | Done |
| 02 | At least 8 tools: list, read, write, str_replace, delete + git-lite or search | 12 tools in `src/tools/` (search **and** git-lite) | discovery test, Inspector CLI `tools/list` = 12; [tools-reference.md](tools-reference.md) | Done |
| 03 | Served over HTTPS through a tunnel, kept alive by a process manager | `ecosystem.config.cjs` (pm2), ngrok steps in [deployment.md](deployment.md) | pm2 start/crash-restart/stop verified | **Done (unverified part):** ngrok tunnel not run by me |
| 04 | Handoff protocol: PROJECT_STATE, PLAN_LOG, CHECKPOINTS, DECISIONS | `src/tools/handoff.ts`, `templates/handoff/`, [handoff-protocol.md](handoff-protocol.md) | `handoff.test.ts`, `multisession.test.ts` | Done |
| 05 | Connected to a real MCP client; multi-step task across 2+ sessions | stateful sessions; `scripts/demo.ts` | MCP SDK client + Inspector CLI; [demo-transcript.md](demo-transcript.md) (2 sessions, 18 calls) | **Done (unverified part):** needs a run with an LLM client (e.g. Claude Code) through the tunnel |
| 06 | Short report on stack, tool design, security trade-offs | [architecture.md](architecture.md) (stack + tool design), [security.md](security.md) (threats, trade-offs) | n/a | Done (as docs; no separate report written, per the student's instruction. Add one if your instructor requires a standalone file) |

## Stack table (slide 17)
Node.js + TS MCP SDK (`package.json`), Streamable HTTP (`src/server.ts`), zod on every tool input (`src/tools/*.ts`), ngrok static domain (docs), pm2, git on the host (`src/git.ts`), testing with MCP Inspector then a scripted client ([testing.md](testing.md)).

## Milestones
M1 skeleton + `list_files` (commit "M1") · M2 file tools + sandbox tests · M3 pm2 + docs for tunnel · M4 handoff, git-lite, write guards · M5 two-session run, docs. See `git log`.

## Rubric (100 pts) -> evidence
| Criterion | Evidence in repo |
|---|---|
| A Agent efficiency (transcript, PLAN_LOG) | `docs/demo-transcript.md` (18 calls, reads before writing, `search_files`/line ranges keep outputs small, no retries), `docs/demo/PLAN_LOG.md` |
| B Agent/tool management (handoff files, logs, config) | handoff protocol, `if_version`, `delete_file` gate, `logs/calls.jsonl` with session ids (`docs/demo/calls.jsonl`), config |
| C Tool design (source, Inspector run) | `src/tools/*`, strict schemas, `isError` messages, no stack traces, Inspector CLI run in [testing.md](testing.md) |
| D Stack and architecture | [architecture.md](architecture.md), env-based config, survives restart (tested + pm2) |
| E Security and sandboxing | path/symlink tests, token required (401 test), threat list with residual risks |
| F Documentation, practice, demo | README + 11 docs, commit history per milestone; **live demo is up to you** |

## Stretch goals
`if_version` locking: **done**. Token auth: **done (mandatory)**. `search_code`: not as a separate tool (`search_files` with regex covers the need). Repo map: not implemented.

## Discrepancies between the student's prompt and the PDF
1. The PDF's deliverables include a tool-call transcript, short report and live demo; the prompt asked to skip separate reports/videos. The transcript is generated automatically and the report content lives in `architecture.md`/`security.md`; the live demo remains the student's task.
2. The PDF lists token auth as *stretch*; Rubric E requires the public endpoint to need a secret, so it is mandatory here.
3. Rubric E mentions `workspace/`; the default sandbox root is `./workspace`.
