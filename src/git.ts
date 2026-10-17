import { execFile } from "node:child_process";
import path from "node:path";

export interface GitResult {
  code: number; // 0 ok, >0 git exit code, -1 failed to run, -2 git not installed
  stdout: string;
  stderr: string;
  truncated: boolean;
}

export const GIT_IDENTITY = ["-c", "user.name=mcp-file-server", "-c", "user.email=mcp-file-server@localhost"];

/**
 * Run git WITHOUT a shell: execFile passes each argument separately, so client text can never
 * become a command. Callers only pass fixed subcommands; hooks and user/system config are disabled.
 */
export function runGit(root: string, args: string[], maxOutput = 200_000): Promise<GitResult> {
  return new Promise((resolve) => {
    execFile(
      "git",
      ["--no-pager", "-c", "core.hooksPath=/dev/null", ...args],
      {
        cwd: root,
        timeout: 10_000,
        maxBuffer: 5_000_000,
        env: {
          PATH: process.env.PATH ?? "",
          LC_ALL: "C",
          GIT_CONFIG_GLOBAL: "/dev/null",
          GIT_CONFIG_NOSYSTEM: "1",
          GIT_TERMINAL_PROMPT: "0",
          GIT_OPTIONAL_LOCKS: "0",
          // never discover a parent repository above the workspace
          GIT_CEILING_DIRECTORIES: path.dirname(root),
        },
      },
      (err, stdout, stderr) => {
        let code = 0;
        if (err) {
          const c = (err as NodeJS.ErrnoException).code;
          code = c === "ENOENT" ? -2 : typeof c === "number" ? c : -1;
        }
        const truncated = stdout.length > maxOutput;
        resolve({ code, stdout: truncated ? stdout.slice(0, maxOutput) : stdout, stderr, truncated });
      },
    );
  });
}

/** Make git's error text safe for clients: no absolute workspace path, short. */
export function cleanGitError(res: GitResult, root: string): string {
  if (res.code === -2) return "git is not installed on the server.";
  const text = (res.stderr || res.stdout || "git command failed").split(root).join("<workspace>").trim();
  return text.slice(0, 300);
}
