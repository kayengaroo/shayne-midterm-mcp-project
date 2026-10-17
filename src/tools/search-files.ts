import fs from "node:fs/promises";
import path from "node:path";
import { z } from "zod";
import { ToolError } from "../errors.js";
import { looksBinary } from "./file-io.js";
import type { ToolDef } from "./helper.js";

const MAX_FILES_SCANNED = 5000;
const MAX_LINE_CHARS = 500;

const schema = z.strictObject({
  query: z.string().min(1).max(200).describe("Text to find (or a regular expression if regex=true)."),
  path: z.string().max(1024).default(".").describe("Directory (or file) to search. Default: whole workspace."),
  regex: z.boolean().default(false).describe("Treat query as a JavaScript regular expression."),
  case_sensitive: z.boolean().default(false),
  max_results: z.number().int().min(1).max(200).default(50).describe("Cap on matching lines (1-200)."),
});

interface Match {
  path: string;
  line: number;
  text: string;
}

export const searchFiles: ToolDef<typeof schema> = {
  name: "search_files",
  description:
    "Search text files in the workspace for a string or regex (like grep). Read-only. Skips binary/oversized files, " +
    ".git, .env*, .trash and symlinks. Returns {matches:[{path,line,text}], files_scanned, truncated}. " +
    "Use this instead of reading many files.",
  schema,
  readOnly: true,
  async handler({ query, path: p, regex, case_sensitive, max_results }, { sandbox, config }) {
    let test: (line: string) => boolean;
    if (regex) {
      let re: RegExp;
      try {
        re = new RegExp(query, case_sensitive ? "" : "i");
      } catch {
        throw new ToolError("Invalid regular expression.");
      }
      test = (line) => re.test(line);
    } else {
      const needle = case_sensitive ? query : query.toLowerCase();
      test = (line) => (case_sensitive ? line : line.toLowerCase()).includes(needle);
    }

    const start = await sandbox.resolve(p);
    const st = await fs.stat(start.abs).catch(() => null);
    if (!st) throw new ToolError(`Path not found: ${start.rel || "."}`);

    // Collect candidate files breadth-first (never following symlinks).
    const files: Array<{ abs: string; rel: string }> = [];
    let truncated = false;
    if (st.isFile()) {
      files.push(start);
    } else {
      const queue = [start];
      while (queue.length > 0) {
        const cur = queue.shift()!;
        const items = await fs.readdir(cur.abs, { withFileTypes: true });
        items.sort((a, b) => a.name.localeCompare(b.name));
        for (const it of items) {
          if (sandbox.isHidden(it.name) || it.name === ".trash" || it.isSymbolicLink()) continue;
          const entry = { abs: path.join(cur.abs, it.name), rel: path.join(cur.rel, it.name) };
          if (it.isDirectory()) queue.push(entry);
          else if (it.isFile()) {
            if (files.length >= MAX_FILES_SCANNED) {
              truncated = true;
              break;
            }
            files.push(entry);
          }
        }
        if (truncated) break;
      }
    }

    const matches: Match[] = [];
    let scanned = 0;
    for (const f of files) {
      const s = await fs.stat(f.abs);
      if (s.size > config.maxFileBytes) continue;
      const buf = await fs.readFile(f.abs);
      if (looksBinary(buf)) continue;
      scanned++;
      const lines = buf.toString("utf8").split("\n");
      for (let i = 0; i < lines.length; i++) {
        // Cap line length: also limits damage from a pathological regex.
        const line = lines[i]!.slice(0, MAX_LINE_CHARS);
        if (test(line)) {
          if (matches.length >= max_results) {
            return { matches, files_scanned: scanned, truncated: true };
          }
          matches.push({ path: f.rel, line: i + 1, text: line.trim().slice(0, 300) });
        }
      }
    }
    return { matches, files_scanned: scanned, truncated };
  },
};
