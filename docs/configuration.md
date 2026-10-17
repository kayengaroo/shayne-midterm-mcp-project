# Configuration

All settings are environment variables, validated at startup by `src/config.ts` (zod). In development they are read from `.env` (gitignored). Invalid configuration stops the server with a message that names the variable but never prints its value.

| Variable | Required | Default | Meaning |
|---|---|---|---|
| `MCP_AUTH_TOKEN` | **yes** | none | Shared secret; clients send `Authorization: Bearer <token>`. Min 16 chars. |
| `PORT` | no | `3000` | HTTP port (`0` = random, used by tests). |
| `HOST` | no | `127.0.0.1` | Bind address. Keep loopback so only the tunnel can reach it. |
| `WORKSPACE_ROOT` | no | `./workspace` | The sandbox root. Created if missing. Relative paths resolve from the working directory. |
| `LOG_DIR` | no | `./logs` | Holds `calls.jsonl` (tool calls) and `server.log` (internal errors with stacks). Keep it **outside** the workspace so agents can't read it. |
| `MAX_FILE_BYTES` | no | `1000000` | Max size for reading, writing and handoff files. The JSON body limit is derived from it (2x + 200 KB). |

Other config files: `ecosystem.config.cjs` (pm2: 1 instance, auto-restart, 300 MB memory cap, 5 s graceful-stop window, log files in `logs/`), `.env.example` (template, no real secrets), `templates/handoff/*.md` (seed content for new workspaces).
