import fs from "node:fs/promises";
import path from "node:path";
import { z } from "zod";
import { ToolError } from "../errors.js";
import type { ToolDef } from "./helper.js";

const schema = z.strictObject({
  path: z.string().max(1024).default(".").describe("Directory relative to the workspace root. Default: the root."),
  recursive: z.boolean().default(false).describe("Also list subdirectories (symlinks are never followed)."),
  max_entries: z.number().int().min(1).max(1000).default(200).describe("Cap on returned entries (1-1000)."),
});

interface Entry {
  path: string;
  type: "file" | "directory" | "symlink" | "other";
  size?: number;
}

export const listFiles: ToolDef<typeof schema> = {
  name: "list_files",
  description:
    "List files and directories inside the workspace. Read-only. Use before read_file to see what exists. " +
    "Hides .git and .env files. Returns {entries, truncated}.",
  schema,
  readOnly: true,
  async handler({ path: dir, recursive, max_entries }, { sandbox }) {
    const start = await sandbox.resolve(dir);
    const st = await fs.stat(start.abs).catch(() => null);
    if (!st) throw new ToolError(`Directory not found: ${start.rel || "."}`);
    if (!st.isDirectory()) throw new ToolError(`Not a directory: ${start.rel}`);

    const entries: Entry[] = [];
    let truncated = false;
    const queue: Array<{ abs: string; rel: string }> = [start];

    while (queue.length > 0 && !truncated) {
      const current = queue.shift()!;
      const items = await fs.readdir(current.abs, { withFileTypes: true });
      items.sort((a, b) => a.name.localeCompare(b.name));
      for (const item of items) {
        if (sandbox.isHidden(item.name)) continue;
        if (entries.length >= max_entries) {
          truncated = true;
          break;
        }
        const rel = path.join(current.rel, item.name);
        if (item.isDirectory()) {
          entries.push({ path: rel, type: "directory" });
          if (recursive) queue.push({ abs: path.join(current.abs, item.name), rel });
        } else if (item.isFile()) {
          const s = await fs.stat(path.join(current.abs, item.name));
          entries.push({ path: rel, type: "file", size: s.size });
        } else {
          entries.push({ path: rel, type: item.isSymbolicLink() ? "symlink" : "other" });
        }
      }
    }
    return { entries, truncated };
  },
};
