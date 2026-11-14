// Board and List share this view-only rule. The project's steps and its totals never change.
import type { ReducedProject, Step } from "./types";

export type StepFilter = {
  query: string;
  owners: string[];
  mine: boolean;
  waiting: boolean;
  dueWeek: boolean;
  notStarted: boolean;
  dropped: boolean;
  hideOldDone: boolean;
};

export const NO_FILTER: StepFilter = {
  query: "", owners: [], mine: false, waiting: false, dueWeek: false,
  notStarted: false, dropped: false, hideOldDone: false,
};

const oldDone = (s: Step, day: number) => s.column === "done" && day - s.movedDay > 14;

export function olderDoneCount(p: ReducedProject, day: number): number {
  return p.steps.filter((s) => oldDone(s, day)).length;
}

/** Day numbers count working days; the demo's Monday is day 0 and its week has five days. */
export function stepFilter(p: ReducedProject, filter: StepFilter, { day, me }: { day: number; me: string | null }): Step[] {
  const query = filter.query.trim().toLowerCase();
  const weekStart = day - ((day % 5 + 5) % 5);
  const waiting = new Set(p.helpAsks.filter((a) => a.answeredDay === null).map((a) => a.stepId));
  const moved = new Set(p.history.filter((e) => e.type === "project.step.moved").map((e) => e.payload.stepId));
  return p.steps.filter((s) => {
    if (query && !s.text.toLowerCase().includes(query) && !s.external?.key.toLowerCase().includes(query)) return false;
    if (filter.owners.length && (!s.ownerUserId || !filter.owners.includes(s.ownerUserId))) return false;
    if (filter.mine && (me === null || s.ownerUserId !== me)) return false;
    if (filter.waiting && !(s.column === "blocked" && s.waitingOn != null) && !waiting.has(s.id)) return false;
    if (filter.dueWeek && (s.dueDay === null || s.dueDay < weekStart || s.dueDay >= weekStart + 5)) return false;
    if (filter.notStarted && (s.column !== "todo" || s.startedDay !== null || s.movedDay !== s.addedDay || moved.has(s.id))) return false;
    if (filter.dropped && !s.dropped) return false;
    // Searching includes every step, including older Done cards hidden by the Board's default view.
    if (!query && filter.hideOldDone && oldDone(s, day)) return false;
    return true;
  });
}
