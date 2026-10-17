import fs from "node:fs/promises";
import path from "node:path";
import { z } from "zod";
import { ToolError } from "../errors.js";
import { assertSize, atomicWrite, readTextFile, sha } from "./file-io.js";
import { HANDOFF_NAMES, type HandoffName } from "./guards.js";
import type { ToolDef } from "./helper.js";
import { ensureHandoffFiles } from "../workspace-init.js";

// In-process lock per file: two simultaneous appends are applied one after the other.
const locks = new Map<string, Promise<unknown>>();
function withLock<T>(key: string, fn: () => Promise<T>): Promise<T> {
  const prev = locks.get(key) ?? Promise.resolve();
  const run = prev.then(fn, fn);
  locks.set(key, run.catch(() => undefined));
  return run;
}

const readSchema = z.strictObject({
  file: z.enum([...HANDOFF_NAMES, "all"]).default("all").describe("Which handoff file, or 'all'."),
  tail_lines: z.number().int().min(1).max(2000).default(200).describe("Return only the last N lines of each file."),
});

export const handoffRead: ToolDef<typeof readSchema> = {
  name: "handoff_read",
  description:
    "START EVERY SESSION WITH THIS. Reads the handoff files (PROJECT_STATE, PLAN_LOG, CHECKPOINTS, DECISIONS) so you can " +
    "continue earlier work without chat history. Read-only. Returns {files:[{file, version, total_lines, truncated, content}]}. " +
    "Keep PROJECT_STATE's `version` for handoff_update.",
  schema: readSchema,
  readOnly: true,
  async handler({ file, tail_lines }, { sandbox, config }) {
    await ensureHandoffFiles(sandbox);
    const names: readonly HandoffName[] = file === "all" ? HANDOFF_NAMES : [file];
    const files = [];
    for (const name of names) {
      const abs = path.join(sandbox.root, `${name}.md`);
      const { text, version } = await readTextFile(abs, `${name}.md`, config.maxFileBytes);
      const lines = text.split("\n");
      if (text.endsWith("\n")) lines.pop();
      const truncated = lines.length > tail_lines;
      files.push({
        file: name,
        version,
        total_lines: lines.length,
        truncated,
        content: (truncated ? lines.slice(-tail_lines) : lines).join("\n"),
      });
    }
    return { files };
  },
};

const updateSchema = z.strictObject({
  file: z.enum(HANDOFF_NAMES).describe("PROJECT_STATE is replaced; the other three are append-only."),
  mode: z.enum(["replace", "append"]).describe("replace = PROJECT_STATE only; append = PLAN_LOG, CHECKPOINTS, DECISIONS."),
  agent: z.string().regex(/^[A-Za-z0-9._ -]{1,40}$/).describe("Your agent name, recorded in the entry."),
  content: z.string().min(1).max(20_000).describe("New PROJECT_STATE text, or the log entry to append."),
  if_version: z
    .string()
    .regex(/^[0-9a-f]{16}$/)
    .optional()
    .describe("REQUIRED for replace: the PROJECT_STATE version from handoff_read."),
});

export const handoffUpdate: ToolDef<typeof updateSchema> = {
  name: "handoff_update",
  description:
    "Update a handoff file. PROJECT_STATE: mode=replace with if_version from handoff_read (rejected if someone else changed it). " +
    "PLAN_LOG / CHECKPOINTS / DECISIONS: mode=append only; entries are timestamped and attributed to `agent`, history is never rewritten. " +
    "Returns {file, version, bytes}.",
  schema: updateSchema,
  readOnly: false,
  destructive: true,
  async handler({ file, mode, agent, content, if_version }, { sandbox, config }) {
    const isState = file === "PROJECT_STATE";
    if (isState && mode !== "replace") throw new ToolError("PROJECT_STATE must be updated with mode=replace.");
    if (!isState && mode !== "append") throw new ToolError(`${file} is append-only. Use mode=append.`);
    if (isState && !if_version) {
      throw new ToolError("replace requires if_version. Call handoff_read first and pass PROJECT_STATE's version.");
    }
    await ensureHandoffFiles(sandbox);
    const abs = path.join(sandbox.root, `${file}.md`);

    return withLock(abs, async () => {
      const { text, version } = await readTextFile(abs, `${file}.md`, config.maxFileBytes);
      let next: string;
      if (isState) {
        if (if_version !== version) {
          throw new ToolError(
            `Version conflict: PROJECT_STATE changed since you read it (current version ${version}). Call handoff_read and merge your changes.`,
          );
        }
        next = content.endsWith("\n") ? content : content + "\n";
      } else {
        next = `${text.endsWith("\n") ? text : text + "\n"}\n### ${new Date().toISOString()} | ${agent}\n${content.trim()}\n`;
      }
      assertSize(next, config.maxFileBytes);
      await atomicWrite(abs, next);
      return { file, version: sha(next), bytes: Buffer.byteLength(next, "utf8") };
    });
  },
};

export async function handoffFilesExist(root: string): Promise<boolean> {
  return fs.stat(path.join(root, "PROJECT_STATE.md")).then(() => true, () => false);
}
