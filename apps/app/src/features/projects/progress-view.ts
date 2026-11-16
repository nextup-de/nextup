// The Steps card of Projects › Progress: how far each project's board has come, which steps are stuck, and which
// projects are done with their steps. Projects only (Kevin and Sam, 16 Nov 2026: ideas live in the Ideas tab).
// Pure: the projects and today in, plain rows out.
import { isStuck } from "./overview-view";
import type { ProjectStatus, ReducedProject } from "./types";

export type StepProgress = {
  id: string;
  number: number;
  title: string;
  status: ProjectStatus;
  /** Steps on the board, dropped ones left out. */
  total: number;
  done: number;
  doing: number;
  blocked: number;
  todo: number;
  /** Open steps in Doing or Blocked that have not moved for STUCK_DAYS or more. */
  stuck: number;
  /** Days the longest-stuck step has sat; null when nothing is stuck. */
  longestStuckDays: number | null;
  /** Open steps past their due day. */
  late: number;
  /** Every step done (and there is at least one). */
  allDone: boolean;
};

// Open projects first, in the order they need attention; done and closed ones after them.
const RANK: Record<ProjectStatus, number> = { running: 0, planning: 1, measuring: 2, measured: 3, recognised: 3, stopped: 4 };

/** One row per project that is not stopped: stuck ones first, then late ones, then by status and number. */
export function stepProgress(list: readonly ReducedProject[], day: number): StepProgress[] {
  return list
    .filter((p) => p.status !== "stopped")
    .map((p): StepProgress => {
      const steps = p.steps.filter((s) => !s.dropped);
      const open = steps.filter((s) => s.column !== "done");
      const stuck = open.filter((s) => isStuck(s, day));
      const count = (c: string) => steps.filter((s) => s.column === c).length;
      return {
        id: p.id, number: p.number, title: p.title, status: p.status,
        total: steps.length, done: count("done"), doing: count("doing"), blocked: count("blocked"), todo: count("todo"),
        stuck: stuck.length,
        longestStuckDays: stuck.length ? Math.max(...stuck.map((s) => day - s.movedDay)) : null,
        late: open.filter((s) => s.dueDay !== null && day > s.dueDay).length,
        allDone: steps.length > 0 && open.length === 0,
      };
    })
    .sort((a, b) => Number(b.stuck > 0) - Number(a.stuck > 0) || Number(b.late > 0) - Number(a.late > 0) || RANK[a.status] - RANK[b.status] || a.number - b.number);
}
