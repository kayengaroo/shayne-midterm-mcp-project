import { z } from "zod";
import { readTextFile } from "./file-io.js";
import type { ToolDef } from "./helper.js";

const schema = z.strictObject({
  path: z.string().min(1).max(1024).describe("File path relative to the workspace root."),
  start_line: z.number().int().min(1).default(1).describe("First line to return (1-based)."),
  max_lines: z.number().int().min(1).max(5000).default(500).describe("Maximum lines to return (1-5000)."),
});

export const readFile: ToolDef<typeof schema> = {
  name: "read_file",
  description:
    "Read a UTF-8 text file (or a range of lines) from the workspace. Read-only. Returns {path, version, total_lines, " +
    "start_line, end_line, truncated, content}. Keep `version` to pass as if_version when you edit. " +
    "Refuses binary files and files over the size limit. Use start_line/max_lines to read big files in chunks.",
  schema,
  readOnly: true,
  async handler({ path: p, start_line, max_lines }, { sandbox, config }) {
    const { abs, rel } = await sandbox.resolve(p);
    const { text, version } = await readTextFile(abs, rel, config.maxFileBytes);
    const lines = text.split("\n");
    if (text.endsWith("\n")) lines.pop();
    const slice = lines.slice(start_line - 1, start_line - 1 + max_lines);
    const end_line = slice.length > 0 ? start_line - 1 + slice.length : start_line - 1;
    return {
      path: rel,
      version,
      total_lines: lines.length,
      start_line,
      end_line,
      truncated: end_line < lines.length,
      content: slice.join("\n"),
    };
  },
};
