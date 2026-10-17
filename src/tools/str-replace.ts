import { z } from "zod";
import { ToolError } from "../errors.js";
import { assertSize, atomicWrite, readTextFile, sha } from "./file-io.js";
import { assertNotHandoff, assertNotTrash } from "./guards.js";
import type { ToolDef } from "./helper.js";

const schema = z.strictObject({
  path: z.string().min(1).max(1024).describe("File path relative to the workspace root."),
  old_str: z.string().min(1).max(100_000).describe("Exact text to replace (whitespace-sensitive)."),
  new_str: z.string().max(1_000_000).describe("Replacement text (may be empty to delete old_str)."),
  replace_all: z.boolean().default(false).describe("Replace every occurrence. Default: old_str must occur exactly once."),
  if_version: z.string().regex(/^[0-9a-f]{16}$/).optional().describe("Version from read_file; edit fails if the file changed."),
});

export const strReplace: ToolDef<typeof schema> = {
  name: "str_replace",
  description:
    "Edit a file by replacing exact text. Fails if old_str is missing, or appears more than once (unless replace_all=true), " +
    "so edits are never ambiguous. Read the file first. Atomic write. Returns {path, replacements, version}.",
  schema,
  readOnly: false,
  destructive: true,
  async handler({ path: p, old_str, new_str, replace_all, if_version }, { sandbox, config }) {
    const { abs, rel } = await sandbox.resolve(p);
    assertNotHandoff(rel);
    assertNotTrash(rel);
    const { text, version } = await readTextFile(abs, rel, config.maxFileBytes);
    if (if_version && if_version !== version) {
      throw new ToolError(`Version conflict: ${rel} changed (current version ${version}). Re-read it and retry.`);
    }
    const parts = text.split(old_str);
    const count = parts.length - 1;
    if (count === 0) throw new ToolError(`old_str not found in ${rel}. It must match exactly, including whitespace.`);
    if (count > 1 && !replace_all) {
      throw new ToolError(`old_str appears ${count} times in ${rel}. Add more surrounding context or set replace_all=true.`);
    }
    // split/join (not String.replace) so "$&" in new_str is treated literally
    const updated = replace_all ? parts.join(new_str) : parts[0] + new_str + parts.slice(1).join(old_str);
    assertSize(updated, config.maxFileBytes);
    await atomicWrite(abs, updated);
    return { path: rel, replacements: replace_all ? count : 1, version: sha(updated) };
  },
};
