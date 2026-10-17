import fs from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { cleanGitError, GIT_IDENTITY, runGit } from "./git.js";
import type { Sandbox } from "./sandbox.js";
import { HANDOFF_NAMES } from "./tools/guards.js";

// Works from src/ (tsx) and dist/ (node): templates/ sits next to both.
const TEMPLATE_DIR = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..", "templates", "handoff");

/** Create any missing handoff file from its template (never overwrites existing content). */
export async function ensureHandoffFiles(sandbox: Sandbox): Promise<void> {
  for (const name of HANDOFF_NAMES) {
    try {
      await fs.copyFile(path.join(TEMPLATE_DIR, `${name}.md`), path.join(sandbox.root, `${name}.md`), fs.constants.COPYFILE_EXCL);
    } catch (err) {
      if ((err as NodeJS.ErrnoException).code !== "EEXIST") throw err;
    }
  }
}

/** Seed handoff files and make the workspace its own git repository (for the git_* tools). */
export async function initWorkspace(sandbox: Sandbox): Promise<void> {
  await ensureHandoffFiles(sandbox);
  const gitDir = path.join(sandbox.root, ".git");
  if (await fs.stat(gitDir).then(() => true, () => false)) return;

  const init = await runGit(sandbox.root, ["init", "-q"]);
  if (init.code !== 0) {
    // git missing is not fatal for the file tools; git_* tools will report it.
    console.warn(`Workspace git init skipped: ${cleanGitError(init, sandbox.root)}`);
    return;
  }
  await runGit(sandbox.root, ["symbolic-ref", "HEAD", "refs/heads/main"]);
  await fs.mkdir(path.join(gitDir, "info"), { recursive: true });
  await fs.writeFile(path.join(gitDir, "info", "exclude"), ".trash/\n*.tmp\n.env*\n");
  await runGit(sandbox.root, ["add", "-A"]);
  await runGit(sandbox.root, [...GIT_IDENTITY, "commit", "--no-verify", "--no-gpg-sign", "-q", "-m", "Initialize workspace"]);
}
