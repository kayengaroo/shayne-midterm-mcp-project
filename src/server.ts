import { createHash, randomUUID, timingSafeEqual } from "node:crypto";
import type { Server } from "node:http";
import express, { type NextFunction, type Request, type Response } from "express";
import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { StreamableHTTPServerTransport } from "@modelcontextprotocol/sdk/server/streamableHttp.js";
import { isInitializeRequest } from "@modelcontextprotocol/sdk/types.js";
import type { Config } from "./config.js";
import { CallLogger } from "./logger.js";
import { Sandbox } from "./sandbox.js";
import { registerAllTools } from "./tools/index.js";
import { initWorkspace } from "./workspace-init.js";

/** Constant-time token comparison (hash first so lengths always match). */
function tokenMatches(provided: string, expected: string): boolean {
  const a = createHash("sha256").update(provided).digest();
  const b = createHash("sha256").update(expected).digest();
  return timingSafeEqual(a, b);
}

function jsonRpcError(res: Response, status: number, message: string): void {
  res.status(status).json({ jsonrpc: "2.0", error: { code: -32000, message }, id: null });
}

export interface RunningServer {
  port: number;
  sandbox: Sandbox;
  logger: CallLogger;
  close: () => Promise<void>;
}

export async function startServer(config: Config): Promise<RunningServer> {
  const sandbox = await Sandbox.create(config.workspaceRoot);
  await initWorkspace(sandbox);
  const logger = new CallLogger(config.logDir);
  const ctx = { config, sandbox, logger };
  const sessions = new Map<string, StreamableHTTPServerTransport>();

  const app = express();
  app.disable("x-powered-by");

  // Public health check: reveals nothing except liveness.
  app.get("/health", (_req, res) => {
    res.type("text/plain").send("ok");
  });

  // Everything under /mcp requires the bearer token.
  const requireAuth = (req: Request, res: Response, next: NextFunction): void => {
    const header = req.header("authorization") ?? "";
    const match = /^Bearer (.+)$/.exec(header);
    if (!match || !tokenMatches(match[1]!, config.authToken)) {
      res.status(401).set("WWW-Authenticate", "Bearer").json({ error: "unauthorized" });
      return;
    }
    next();
  };

  app.use("/mcp", requireAuth, express.json({ limit: config.maxFileBytes * 2 + 200_000 }));

  app.post("/mcp", async (req: Request, res: Response) => {
    try {
      const sessionId = req.header("mcp-session-id");
      let transport = sessionId ? sessions.get(sessionId) : undefined;

      if (!transport) {
        if (sessionId) {
          // Unknown id (e.g. after a server restart): 404 tells MCP clients to start a new session.
          jsonRpcError(res, 404, "Session not found. Send a new initialize request.");
          return;
        }
        if (!isInitializeRequest(req.body)) {
          jsonRpcError(res, 400, "Bad Request: no session. Send an initialize request first.");
          return;
        }
        // New session: one McpServer + transport per client session.
        const newTransport = new StreamableHTTPServerTransport({
          sessionIdGenerator: () => randomUUID(),
          onsessioninitialized: (id) => {
            sessions.set(id, newTransport);
          },
        });
        newTransport.onclose = () => {
          if (newTransport.sessionId) sessions.delete(newTransport.sessionId);
        };
        const mcp = new McpServer({ name: "midterm-mcp-file-server", version: "1.0.0" });
        registerAllTools(mcp, ctx);
        await mcp.connect(newTransport);
        transport = newTransport;
      }
      await transport.handleRequest(req, res, req.body);
    } catch (err) {
      logger.logInternal("POST /mcp failed", err);
      if (!res.headersSent) jsonRpcError(res, 500, "Internal server error");
    }
  });

  // GET (server-to-client stream) and DELETE (end session) reuse the session transport.
  const sessionRequest = async (req: Request, res: Response): Promise<void> => {
    const sessionId = req.header("mcp-session-id");
    const transport = sessionId ? sessions.get(sessionId) : undefined;
    if (!transport) {
      jsonRpcError(res, sessionId ? 404 : 400, sessionId ? "Session not found" : "Missing session id");
      return;
    }
    await transport.handleRequest(req, res);
  };
  app.get("/mcp", sessionRequest);
  app.delete("/mcp", sessionRequest);

  // Malformed JSON etc. -> clean 400, no stack trace.
  app.use((err: Error & { status?: number }, _req: Request, res: Response, _next: NextFunction) => {
    const status = err.status && err.status >= 400 && err.status < 500 ? err.status : 500;
    if (status === 500) logger.logInternal("express error", err);
    jsonRpcError(res, status, status === 500 ? "Internal server error" : "Bad request");
  });

  const httpServer: Server = await new Promise((resolve, reject) => {
    const s = app.listen(config.port, config.host, () => resolve(s));
    s.once("error", reject);
  });
  const address = httpServer.address();
  const port = typeof address === "object" && address ? address.port : config.port;

  return {
    port,
    sandbox,
    logger,
    close: async () => {
      await Promise.all([...sessions.values()].map((t) => t.close().catch(() => undefined)));
      sessions.clear();
      httpServer.closeAllConnections();
      await new Promise<void>((resolve) => httpServer.close(() => resolve()));
    },
  };
}
