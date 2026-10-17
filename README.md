# MCP File-Server Connector

A **sandboxed file-server for AI agents**, built as an MCP (Model Context Protocol) server in Node.js + TypeScript. An agent connects over **Streamable HTTP**, protected by a bearer token, and gets 12 tools to list, read, write, edit, delete and search files inside one workspace folder, inspect/commit with a "git-lite" toolset, and keep **handoff files** (`PROJECT_STATE`, `PLAN_LOG`, `CHECKPOINTS`, `DECISIONS`) so a *new* agent session can continue where the last one stopped.

Midterm project (Week 06, Model Context Protocol). Requirement coverage: [docs/requirements-traceability.md](docs/requirements-traceability.md).

## Features
- **Sandbox:** every path is resolved against `WORKSPACE_ROOT`; `..`, absolute paths, symlink escapes, `.git` and `.env*` are rejected.
- **12 tools**, each with a strict zod schema and a clear description: `list_files`, `read_file`, `write_file`, `str_replace`, `delete_file`, `search_files`, `git_status`, `git_diff`, `git_log`, `git_commit`, `handoff_read`, `handoff_update`.
- **Safe writes:** atomic (temp file + rename), size limits, overwrite guard, optional `if_version` optimistic locking.
- **Gated deletes:** `confirm=true` required; files go to `.trash/` (recoverable).
- **Auth:** bearer token (constant-time compare). Only `/health` is public and it returns just `ok`.
- **Logging:** every tool call is appended to `logs/calls.jsonl`; errors come back as `isError` messages, never stack traces.
- **Deployment:** pm2 process manager + HTTPS tunnel (ngrok static domain).

## Prerequisites
Node.js 20+ (developed on 22), npm, git. For deployment: pm2 (`npm i -g pm2`) and an ngrok account (free tier includes one static domain).

## Install and run (local)
```bash
git clone <your-repo-url> midterm-mcp-file-server && cd midterm-mcp-file-server
npm install
cp .env.example .env
# put a real secret in .env:
node -e "console.log(require('crypto').randomBytes(32).toString('hex'))"   # paste as MCP_AUTH_TOKEN
npm run dev            # or: npm run build && npm start
curl localhost:3000/health   # -> ok
```
On first start the server creates `workspace/`, seeds the four handoff files and runs `git init` inside it.

## Development commands
| Command | Purpose |
|---|---|
| `npm run dev` | run from TypeScript (tsx) |
| `npm run typecheck` | `tsc --noEmit` |
| `npm run build` / `npm start` | compile to `dist/` / run compiled server |
| `npm test` | vitest (71 tests, uses temp dirs, a real MCP client and real servers) |
| `npm run demo` | scripted 2-session task; writes `docs/demo-transcript.md` |

## Connect a client
Endpoint: `http(s)://<host>/mcp` with header `Authorization: Bearer <MCP_AUTH_TOKEN>`.
- **MCP Inspector (CLI):** `npx @modelcontextprotocol/inspector --cli http://127.0.0.1:3000/mcp --transport http --header "Authorization: Bearer $MCP_AUTH_TOKEN" --method tools/list`
- **Claude Code:** `claude mcp add --transport http file-server https://<your-domain>/mcp --header "Authorization: Bearer <token>"`
- Claude.ai / Claude Desktop "custom connectors" use OAuth rather than a static bearer header; this server does not implement OAuth, so use Inspector or Claude Code (check each product's current docs).

## Deploy
pm2 + ngrok, step by step: [docs/deployment.md](docs/deployment.md).

## Documentation
[Architecture](docs/architecture.md) · [Installation](docs/installation.md) · [Configuration](docs/configuration.md) · [Tools reference](docs/tools-reference.md) · [Security](docs/security.md) · [Testing](docs/testing.md) · [Deployment](docs/deployment.md) · [Handoff protocol](docs/handoff-protocol.md) · [Troubleshooting](docs/troubleshooting.md) · [Requirements traceability](docs/requirements-traceability.md) · [Demo transcript](docs/demo-transcript.md)

## Project handoff files
The root files `PROJECT_STATE.md`, `PLAN_LOG.md`, `CHECKPOINTS.md`, `DECISIONS.md` record how *this project* was built and let a new agent resume development. (The server's own runtime handoff files live in `workspace/`; examples from the demo are in `docs/demo/`.)
