import fs from "node:fs";
import path from "node:path";

export interface CallLogEntry {
  ts: string;
  session?: string;
  tool: string;
  args: unknown;
  ok: boolean;
  ms: number;
  error?: string;
}

/** Shorten long strings so logs stay small and never hold whole file contents. */
function summarize(value: unknown): unknown {
  if (typeof value === "string") {
    return value.length > 120 ? `${value.slice(0, 120)}…(${value.length} chars)` : value;
  }
  if (Array.isArray(value)) return value.slice(0, 20).map(summarize);
  if (value && typeof value === "object") {
    return Object.fromEntries(Object.entries(value).map(([k, v]) => [k, summarize(v)]));
  }
  return value;
}

/** Append-only JSONL log of every tool call (evidence for "calls are logged"). */
export class CallLogger {
  readonly file: string;
  constructor(dir: string) {
    fs.mkdirSync(dir, { recursive: true });
    this.file = path.join(dir, "calls.jsonl");
  }
  logCall(entry: Omit<CallLogEntry, "ts" | "args"> & { args: unknown }): void {
    const line: CallLogEntry = { ts: new Date().toISOString(), ...entry, args: summarize(entry.args) };
    fs.appendFileSync(this.file, JSON.stringify(line) + "\n");
  }
  /** Internal diagnostics (with stack) go here, never to the client. */
  logInternal(message: string, err: unknown): void {
    const detail = err instanceof Error ? err.stack ?? err.message : String(err);
    fs.appendFileSync(
      path.join(path.dirname(this.file), "server.log"),
      `${new Date().toISOString()} ${message}: ${detail}\n`,
    );
  }
}
