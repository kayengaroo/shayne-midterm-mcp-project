import { ToolError } from "../errors.js";

export const HANDOFF_NAMES = ["PROJECT_STATE", "PLAN_LOG", "CHECKPOINTS", "DECISIONS"] as const;
export type HandoffName = (typeof HANDOFF_NAMES)[number];

/** Handoff files can only be changed via handoff_update (so agents cannot clobber each other). */
export function assertNotHandoff(rel: string): void {
  const lower = rel.toLowerCase();
  if (HANDOFF_NAMES.some((n) => lower === `${n.toLowerCase()}.md`)) {
    throw new ToolError("Handoff files are protected. Use handoff_read / handoff_update instead.");
  }
}

/** .trash is managed by delete_file only. */
export function assertNotTrash(rel: string): void {
  const first = rel.split(/[\\/]/)[0]!.toLowerCase();
  if (first === ".trash") throw new ToolError("The .trash directory is reserved.");
}
