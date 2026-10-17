import fs from "node:fs/promises";
import path from "node:path";
import { ToolError } from "./errors.js";

/** Names file tools may never touch (secrets and git internals). */
function isDeniedName(name: string): boolean {
  return name === ".git" || name === ".env" || name.startsWith(".env.");
}

function isOutside(rel: string): boolean {
  return rel === ".." || rel.startsWith(".." + path.sep) || path.isAbsolute(rel);
}

export interface ResolvedPath {
  /** Absolute, symlink-resolved path that is guaranteed to be inside the workspace. */
  abs: string;
  /** Path relative to the workspace root ("" for the root itself). */
  rel: string;
}

export class Sandbox {
  private constructor(readonly root: string) {}

  /** Creates the root if missing and stores its real (symlink-free) path. */
  static async create(root: string): Promise<Sandbox> {
    await fs.mkdir(root, { recursive: true });
    return new Sandbox(await fs.realpath(root));
  }

  /**
   * Turn a client-supplied relative path into a safe absolute path.
   * 1. reject NUL bytes and absolute paths
   * 2. resolve lexically, then check containment with path.relative (NOT a string prefix)
   * 3. reject denied names (.git, .env*)
   * 4. realpath the deepest existing ancestor so symlinks cannot lead outside
   */
  async resolve(input: string): Promise<ResolvedPath> {
    if (input.includes("\0")) throw new ToolError("Invalid path.");
    if (path.isAbsolute(input)) {
      throw new ToolError("Absolute paths are not allowed. Use a path relative to the workspace root.");
    }
    const lexical = path.resolve(this.root, input);
    const rel = path.relative(this.root, lexical);
    if (isOutside(rel)) throw new ToolError("Path escapes the workspace root.");
    if (rel.split(path.sep).some(isDeniedName)) {
      throw new ToolError("Access to this path is blocked (.git and .env files are protected).");
    }

    // Find the deepest ancestor that exists, resolve its symlinks, re-attach the rest.
    let probe = lexical;
    for (;;) {
      try {
        const real = await fs.realpath(probe);
        const remainder = path.relative(probe, lexical);
        const abs = path.join(real, remainder);
        const relReal = path.relative(this.root, abs);
        if (isOutside(relReal)) throw new ToolError("Path escapes the workspace root (symlink).");
        if (relReal.split(path.sep).some(isDeniedName)) {
          throw new ToolError("Access to this path is blocked (.git and .env files are protected).");
        }
        return { abs, rel: relReal };
      } catch (err) {
        if (err instanceof ToolError) throw err;
        const code = (err as NodeJS.ErrnoException).code;
        if (code !== "ENOENT" && code !== "ENOTDIR") throw new ToolError("Cannot access path.");
        // A dangling symlink exists on disk but realpath fails: refuse (its target may be outside).
        try {
          await fs.lstat(probe);
          throw new ToolError("Broken symlink in path.");
        } catch (e2) {
          if (e2 instanceof ToolError) throw e2;
        }
        const parent = path.dirname(probe);
        if (parent === probe) throw new ToolError("Cannot access path.");
        probe = parent;
      }
    }
  }

  /** Name filter used by listing/search so protected files are not even revealed. */
  isHidden(name: string): boolean {
    return isDeniedName(name);
  }
}
