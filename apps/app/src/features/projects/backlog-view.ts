// The Backlog tool (Paper "Jira pages · new header", frame "NextUp · Work · Backlog (Jira Backlog)"): what is on the board,
// most urgent first, and how far the board is. "Later" (steps parked off the board) has no event behind it yet.
import { DEFAULT_SORT, listRows } from "./list-view";
import { NO_FILTER } from "./step-filter";
import type { ReducedProject, Step } from "./types";

export type BacklogView = { open: Step[]; done: number; doing: number; todo: number };

/** The open steps (not done, not dropped) in the List's "what needs you first" order, and the board's counts. */
export function backlogOf(p: ReducedProject, ctx: { day: number; me: string | null }): BacklogView {
  const live = p.steps.filter((s) => !s.dropped);
  const open = listRows(p, { ...NO_FILTER }, DEFAULT_SORT, ctx).filter((s) => !s.dropped && s.column !== "done");
  return {
    open,
    done: live.filter((s) => s.column === "done").length,
    doing: live.filter((s) => s.column === "doing" || s.column === "blocked").length,
    todo: live.filter((s) => s.column === "todo").length,
  };
}
