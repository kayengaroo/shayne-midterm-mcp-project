import fs from "node:fs/promises";
import { z } from "zod";
import { ToolError } from "../errors.js";
import { assertSize, atomicWrite, readTextFile, sha } from "./file-io.js";
import { assertNotHandoff, assertNotTrash } from "./guards.js";
import type { ToolDef } from "./helper.js";

const schema = z.strictObject({
  path: z.string().min(1).max(1024).describe("File path relative to the workspace root. Parent directories are created."),
  content: z.string().max(5_000_000).describe("Full UTF-8 file content."),
  overwrite: z.boolean().default(false).describe("Must be true to replace an existing file (unless if_version is given)."),
  if_version: z
    .string()
    .regex(/^[0-9a-f]{16}$/)
    .optional()
    .describe("Version from read_file. The write only succeeds if the file is unchanged since then."),
});

export const writeFile: ToolDef<typeof schema> = {
  name: "write_file",
  description:
    "Create a file, or replace one when overwrite=true or if_version matches. Writes are atomic (temp file + rename). " +
    "Fails if the file exists and neither overwrite nor if_version is given. For small edits prefer str_replace. " +
    "Returns {path, bytes, version, created}.",
  schema,
  readOnly: false,
  destructive: true,
  async handler({ path: p, content, overwrite, if_version }, { sandbox, config }) {
    const { abs, rel } = await sandbox.resolve(p);
    if (rel === "") throw new ToolError("Path must be a file, not the workspace root.");
    assertNotHandoff(rel);
    assertNotTrash(rel);
    assertSize(content, config.maxFileBytes);

    const st = await fs.stat(abs).catch(() => null);
    if (st && !st.isFile()) throw new ToolError(`Not a regular file: ${rel}`);
    if (if_version) {
      if (!st) throw new ToolError(`if_version given but file does not exist: ${rel}`);
      const { version } = await readTextFile(abs, rel, config.maxFileBytes);
      if (version !== if_version) {
        throw new ToolError(`Version conflict: ${rel} changed (current version ${version}). Re-read it and retry.`);
      }
    } else if (st && !overwrite) {
      throw new ToolError(`File already exists: ${rel}. Set overwrite=true to replace it.`);
    }
    await atomicWrite(abs, content);
    return { path: rel, bytes: Buffer.byteLength(content, "utf8"), version: sha(content), created: !st };
  },
};
