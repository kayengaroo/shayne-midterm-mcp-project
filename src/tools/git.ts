import { z } from "zod";
import { ToolError } from "../errors.js";
import { cleanGitError, GIT_IDENTITY, runGit } from "../git.js";
import type { ToolDef } from "./helper.js";

const optionalPath = z.string().min(1).max(1024).optional().describe("Limit to this path (relative to workspace root).");

const statusSchema = z.strictObject({});
export const gitStatus: ToolDef<typeof statusSchema> = {
  name: "git_status",
  description:
    "Show uncommitted changes in the workspace git repository (like `git status`). Read-only. " +
    "Returns {branch, clean, entries:[{status, path}]}; status is the 2-letter porcelain code (e.g. '??' untracked, ' M' modified).",
  schema: statusSchema,
  readOnly: true,
  async handler(_args, { sandbox }) {
    const r = await runGit(sandbox.root, ["status", "--porcelain=v1", "-b", "--untracked-files=all"]);
    if (r.code !== 0) throw new ToolError(cleanGitError(r, sandbox.root));
    const lines = r.stdout.split("\n").filter(Boolean);
    const branch = lines[0]?.startsWith("## ") ? lines.shift()!.slice(3) : "";
    return { branch, clean: lines.length === 0, entries: lines.map((l) => ({ status: l.slice(0, 2), path: l.slice(3) })) };
  },
};

const diffSchema = z.strictObject({
  path: optionalPath,
  staged: z.boolean().default(false).describe("Show staged changes instead of unstaged."),
  max_bytes: z.number().int().min(1000).max(100_000).default(20_000).describe("Cap on diff size returned."),
});
export const gitDiff: ToolDef<typeof diffSchema> = {
  name: "git_diff",
  description: "Show a unified diff of changes in the workspace repository. Read-only. Returns {diff, truncated}.",
  schema: diffSchema,
  readOnly: true,
  async handler({ path: p, staged, max_bytes }, { sandbox }) {
    const args = ["diff", "--no-ext-diff", "--no-color", ...(staged ? ["--cached"] : []), "--"];
    if (p) args.push((await sandbox.resolve(p)).rel);
    const r = await runGit(sandbox.root, args, max_bytes);
    if (r.code !== 0) throw new ToolError(cleanGitError(r, sandbox.root));
    return { diff: r.stdout, truncated: r.truncated };
  },
};

const logSchema = z.strictObject({
  max_count: z.number().int().min(1).max(50).default(10).describe("Number of commits (1-50)."),
  path: optionalPath,
});
export const gitLog: ToolDef<typeof logSchema> = {
  name: "git_log",
  description: "List recent commits (newest first) in the workspace repository. Read-only. Returns {commits:[{hash, author, date, subject}]}.",
  schema: logSchema,
  readOnly: true,
  async handler({ max_count, path: p }, { sandbox }) {
    const args = ["log", `--max-count=${max_count}`, "--format=%h%x1f%an%x1f%aI%x1f%s", "--"];
    if (p) args.push((await sandbox.resolve(p)).rel);
    const r = await runGit(sandbox.root, args);
    if (r.code === 128 && /does not have any commits/.test(r.stderr)) return { commits: [] };
    if (r.code !== 0) throw new ToolError(cleanGitError(r, sandbox.root));
    const commits = r.stdout
      .split("\n")
      .filter(Boolean)
      .map((l) => {
        const [hash, author, date, subject] = l.split("\x1f");
        return { hash, author, date, subject };
      });
    return { commits };
  },
};

const commitSchema = z.strictObject({
  message: z.string().min(1).max(200).describe("Commit message (1-200 chars)."),
  paths: z.array(z.string().min(1).max(1024)).max(50).optional().describe("Only commit these paths. Default: all changes."),
});
export const gitCommit: ToolDef<typeof commitSchema> = {
  name: "git_commit",
  description:
    "Stage and commit changes in the workspace repository (use it to create a checkpoint). Fails with a clear message if there is " +
    "nothing to commit. Does not push, and cannot run arbitrary git commands. Returns {commit, message}.",
  schema: commitSchema,
  readOnly: false,
  async handler({ message, paths }, { sandbox }) {
    const rels: string[] = [];
    for (const p of paths ?? ["."]) rels.push((await sandbox.resolve(p)).rel || ".");
    const add = await runGit(sandbox.root, ["add", "-A", "--", ...rels]);
    if (add.code !== 0) throw new ToolError(cleanGitError(add, sandbox.root));
    const staged = await runGit(sandbox.root, ["diff", "--cached", "--quiet"]);
    if (staged.code === 0) throw new ToolError("Nothing to commit.");
    const c = await runGit(sandbox.root, [...GIT_IDENTITY, "commit", "--no-verify", "--no-gpg-sign", "-m", message]);
    if (c.code !== 0) throw new ToolError(cleanGitError(c, sandbox.root));
    const head = await runGit(sandbox.root, ["rev-parse", "--short", "HEAD"]);
    return { commit: head.stdout.trim(), message };
  },
};
