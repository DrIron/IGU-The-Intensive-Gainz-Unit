import type { ProgramStatus } from "./shared/ProgramStatusPill";

/**
 * Derive a program's status pill from what it actually contains and who is on it.
 *
 * Kept out of `shared/` because it is a policy decision about IGU's library, not a
 * presentational primitive — `ProgramStatusPill` stays dumb and takes the answer.
 *
 *   in_use — at least one active client is on a clone of this program
 *   ready  — it has real prescribed volume, nobody is on it yet
 *   draft  — no volume yet (a shell the coach hasn't filled in)
 */
export function deriveProgramStatus(sets: number, activeClients: number): ProgramStatus {
  if (activeClients > 0) return "in_use";
  if (sets > 0) return "ready";
  return "draft";
}
