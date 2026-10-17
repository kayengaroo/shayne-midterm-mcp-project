# Installation

1. **Requirements:** Node.js >= 20 (`node -v`), npm, git (`git --version`; the git tools need it on the server's PATH).
2. **Get the code:** `git clone <repo-url> && cd midterm-mcp-file-server`
3. **Install:** `npm install`
4. **Configure:** `cp .env.example .env`, then set `MCP_AUTH_TOKEN` to a random string of at least 16 characters:
   `node -e "console.log(require('crypto').randomBytes(32).toString('hex'))"`
5. **Verify the toolchain:** `npm run typecheck && npm test && npm run build`
6. **Run:** `npm run dev` (TypeScript) or `npm start` (after `npm run build`). Expect:
   `MCP file server listening on http://127.0.0.1:3000/mcp`
7. **Smoke test:** `curl localhost:3000/health` prints `ok`; `curl -i -X POST localhost:3000/mcp` returns `401`.
8. **Try the demo:** `npm run demo` (starts its own temporary server; writes `docs/demo-transcript.md`).

The first start creates `WORKSPACE_ROOT` (default `./workspace`), copies the four handoff templates into it and runs `git init` there. Next: [deployment.md](deployment.md).
