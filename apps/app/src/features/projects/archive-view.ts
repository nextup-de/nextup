// The Archive tool (Paper "Jira pages · new header", frame "NextUp · Work · Archive (Jira Archived)"): the steps taken off
// the board (dropped on the Done sheet, D13). They count in no total; the reducer keeps them with who dropped them and when.
import type { ReducedProject, Step } from "./types";

export type ArchivedStep = { step: Step; byUserId: string | null; day: number; why: string };

/** Every dropped step, newest drop first; a query matches the step's text or key, case ignored. */
export function archivedSteps(p: Pick<ReducedProject, "steps">, query = ""): ArchivedStep[] {
  const needle = query.trim().toLowerCase();
  return p.steps
    .filter((step): step is Step & { dropped: NonNullable<Step["dropped"]> } => !!step.dropped)
    .filter((step) => !needle || step.text.toLowerCase().includes(needle) || (step.external?.key ?? "").toLowerCase().includes(needle))
    .map((step) => ({ step, byUserId: step.dropped.byUserId, day: step.dropped.day, why: step.dropped.why }))
    .sort((a, b) => b.day - a.day);
}
