import { createHash, randomUUID } from "node:crypto";
import fs from "node:fs/promises";
import path from "node:path";
import { ToolError } from "../errors.js";

/** Short content hash used as an optimistic-locking "version" (if_version). */
export function sha(data: Buffer | string): string {
  return createHash("sha256").update(data).digest("hex").slice(0, 16);
}

export function looksBinary(buf: Buffer): boolean {
  return buf.subarray(0, 8000).includes(0);
}

export async function readTextFile(
  abs: string,
  rel: string,
  maxBytes: number,
): Promise<{ text: string; version: string }> {
  const st = await fs.stat(abs).catch(() => null);
  if (!st) throw new ToolError(`File not found: ${rel}`);
  if (!st.isFile()) throw new ToolError(`Not a regular file: ${rel}`);
  if (st.size > maxBytes) {
    throw new ToolError(`File too large (${st.size} bytes, limit ${maxBytes}): ${rel}`);
  }
  const buf = await fs.readFile(abs);
  if (looksBinary(buf)) throw new ToolError(`Binary file, cannot be read as text: ${rel}`);
  return { text: buf.toString("utf8"), version: sha(buf) };
}

export function assertSize(text: string, maxBytes: number): void {
  const bytes = Buffer.byteLength(text, "utf8");
  if (bytes > maxBytes) {
    throw new ToolError(`Content too large (${bytes} bytes, limit ${maxBytes}).`);
  }
}

/** Safe update pattern: write a temp file in the same directory, then rename over the target. */
export async function atomicWrite(abs: string, text: string): Promise<void> {
  await fs.mkdir(path.dirname(abs), { recursive: true });
  const tmp = `${abs}.${randomUUID().slice(0, 8)}.tmp`;
  try {
    await fs.writeFile(tmp, text, { encoding: "utf8", flag: "wx" });
    await fs.rename(tmp, abs);
  } catch (err) {
    await fs.rm(tmp, { force: true });
    throw err;
  }
}

export const versionSchemaHint = "16-hex-char version returned by read_file / write_file / str_replace";
