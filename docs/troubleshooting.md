# Troubleshooting

| Symptom | Cause / fix |
|---|---|
| Server exits: `Invalid configuration: MCP_AUTH_TOKEN ...` | Missing/short token. Set 16+ chars in `.env` (or the pm2 environment). |
| `EADDRINUSE` | Port taken. Change `PORT` or stop the other process (`pm2 status`, `lsof -i :3000`). |
| Client gets `401` | Wrong/missing header. It must be exactly `Authorization: Bearer <token>`. After rotating the token, restart with `--update-env`. |
| `400 Bad Request: no session` | The first request must be `initialize`; use an MCP client rather than raw curl, or send `initialize` first with `Accept: application/json, text/event-stream`. |
| `404 Session not found` | Server restarted (sessions are in memory). Reconnect; the client re-initializes. Use `handoff_read` to recover context. |
| pm2 app online but `/health` fails | Check `pm2 logs mcp-file-server --err`; `.env` must be in the project folder (pm2 `cwd`). Run `npm run build` first (pm2 runs `dist/`). |
| `Path escapes the workspace root` / `Absolute paths are not allowed` | Working as designed. Use relative paths like `notes/a.txt`. |
| `Access to this path is blocked` | `.git` and `.env*` are protected. |
| `Handoff files are protected` | Use `handoff_read`/`handoff_update`. |
| `Version conflict` | File changed since you read it. `read_file`/`handoff_read` again, merge, retry with the new version. |
| `File already exists` | Pass `overwrite=true` or use `str_replace`. |
| `old_str appears N times` | Include more surrounding text or set `replace_all=true`. |
| `File too large` / `Content too large` | Raise `MAX_FILE_BYTES` or split the file; read big files in line ranges (still bounded by the size limit). |
| `git is not installed on the server` / git tools fail | Install git and make sure it is on the server's PATH. Delete `workspace/.git` to have it re-created on next start. |
| Deleted a file by mistake | Look in `workspace/.trash/` and move it back with your own shell. |
| ngrok `ERR_NGROK_...` / domain not found | Check authtoken, that the static domain is claimed, and that the agent flags match your version (`--url` vs `--domain`). |
| Inspector cannot connect | Use transport *Streamable HTTP* (not SSE/stdio), include the Authorization header, point at `/mcp`. |
| Claude.ai connector rejects the server | Custom connectors there expect OAuth; this server uses a static bearer token. Use Claude Code or Inspector. |
