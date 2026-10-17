# Deployment

Pipeline: client --HTTPS--> **ngrok** (static domain) --> `127.0.0.1:3000` **Express/MCP** kept alive by **pm2**. Only `/health` and `/mcp` exist; `/mcp` needs the bearer token. Steps marked (unverified) were not run by the author of this doc; pm2 steps were run (see [testing.md](testing.md)).

## 1. Prepare the host
```bash
npm install && cp .env.example .env     # set MCP_AUTH_TOKEN (32+ random hex chars)
npm run build
npm i -g pm2
```
## 2. Start under pm2
```bash
pm2 start ecosystem.config.cjs
pm2 status
curl localhost:3000/health               # ok
pm2 logs mcp-file-server                 # live logs (also in logs/pm2-out.log, pm2-error.log)
pm2 save && pm2 startup                  # (unverified) run the command it prints to start pm2 on boot
```
pm2 reads secrets from `.env` (loaded by dotenv from the project folder); nothing secret is in `ecosystem.config.cjs`.

## 3. Expose with ngrok (unverified)
1. Create a free ngrok account, copy your authtoken, run `ngrok config add-authtoken <token>` (stored in ngrok's own config, never in this repo).
2. In the ngrok dashboard claim your free **static domain**, e.g. `your-name.ngrok-free.app`.
3. Run: `ngrok http 3000 --url=your-name.ngrok-free.app` (older agents: `--domain=`).
4. Keep it alive too: `pm2 start ngrok --interpreter none --name mcp-tunnel -- http 3000 --url=your-name.ngrok-free.app`
5. Check: `curl https://your-name.ngrok-free.app/health` -> `ok`; `curl -i -X POST https://your-name.ngrok-free.app/mcp` -> `401`.

Alternative: **Cloudflare Tunnel** (`cloudflared tunnel --url http://localhost:3000`, quick tunnels give a random URL; a named tunnel needs a Cloudflare domain). Free-tier limits and account requirements apply to both.

## 4. Connect a real client
See README "Connect a client". Use `https://<domain>/mcp` plus the `Authorization: Bearer` header.

## Operations
| Task | Command |
|---|---|
| Restart | `pm2 restart mcp-file-server` |
| Rotate token | edit `.env`, then `pm2 restart mcp-file-server --update-env`, update clients |
| Update code | `git pull && npm ci && npm run build && pm2 restart mcp-file-server` |
| Stop | `pm2 stop mcp-file-server` (server gets SIGINT, closes sessions, exits; pm2 waits up to 5 s) |
| Logs | `logs/pm2-*.log` (process), `logs/calls.jsonl` (tool calls), `logs/server.log` (internal errors) |

## Behaviour on restart
The workspace (files, handoff files, git repo) is on disk and survives. MCP sessions are in memory and end; clients get 404 for the old session id and must re-initialize. Agents recover context with `handoff_read`.

## Do not
Expose any port other than the tunnel; set `HOST=0.0.0.0` on a public machine; commit `.env`; share the token in chat or screenshots.
