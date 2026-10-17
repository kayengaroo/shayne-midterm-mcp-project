import crypto from "node:crypto";
import fs from "node:fs/promises";
import path from "node:path";
import { z } from "zod";
import { ToolError } from "../errors.js";
import { assertNotHandoff, assertNotTrash } from "./guards.js";
import type { ToolDef } from "./helper.js";

const schema = z.strictObject({
  path: z.string().min(1).max(1024).describe("File path relative to the workspace root."),
  confirm: z.boolean().describe("Must be true. Safety gate against accidental deletion."),
});

export const deleteFile: ToolDef<typeof schema> = {
  name: "delete_file",
  description:
    "Delete a single file. Requires confirm=true. The file is MOVED to .trash/ inside the workspace (recoverable), " +
    "not erased. Directories and handoff files cannot be deleted. Returns {deleted, moved_to}.",
  schema,
  readOnly: false,
  destructive: true,
  async handler({ path: p, confirm }, { sandbox }) {
    if (confirm !== true) throw new ToolError("Deletion requires confirm=true.");
    const { abs, rel } = await sandbox.resolve(p);
    if (rel === "") throw new ToolError("Cannot delete the workspace root.");
    assertNotHandoff(rel);
    assertNotTrash(rel);
    const st = await fs.lstat(abs).catch(() => null);
    if (!st) throw new ToolError(`File not found: ${rel}`);
    if (!st.isFile()) throw new ToolError(`Only regular files can be deleted: ${rel}`);

    const name = `${Date.now()}-${crypto.randomBytes(2).toString("hex")}-${path.basename(abs)}`;
    const trashDir = path.join(sandbox.root, ".trash");
    await fs.mkdir(trashDir, { recursive: true });
    await fs.rename(abs, path.join(trashDir, name));
    return { deleted: rel, moved_to: path.join(".trash", name) };
  },
};
