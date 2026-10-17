import path from "node:path";
import { z } from "zod";

const EnvSchema = z.object({
  PORT: z.coerce.number().int().min(0).max(65535).default(3000),
  HOST: z.string().min(1).default("127.0.0.1"),
  WORKSPACE_ROOT: z.string().min(1).default("./workspace"),
  LOG_DIR: z.string().min(1).default("./logs"),
  MCP_AUTH_TOKEN: z.string().min(16, "must be at least 16 characters"),
  MAX_FILE_BYTES: z.coerce.number().int().positive().default(1_000_000),
});

export interface Config {
  port: number;
  host: string;
  workspaceRoot: string; // absolute
  logDir: string; // absolute
  authToken: string;
  maxFileBytes: number;
}

/** Validate environment variables. Error messages never include values (secrets). */
export function loadConfig(env: Record<string, string | undefined> = process.env): Config {
  const parsed = EnvSchema.safeParse(env);
  if (!parsed.success) {
    const problems = parsed.error.issues
      .map((i) => `${i.path.join(".")}: ${i.message}`)
      .join("; ");
    throw new Error(`Invalid configuration: ${problems}`);
  }
  const e = parsed.data;
  return {
    port: e.PORT,
    host: e.HOST,
    workspaceRoot: path.resolve(e.WORKSPACE_ROOT),
    logDir: path.resolve(e.LOG_DIR),
    authToken: e.MCP_AUTH_TOKEN,
    maxFileBytes: e.MAX_FILE_BYTES,
  };
}
