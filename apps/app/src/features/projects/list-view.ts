import type { EventPayload } from "@/features/cases/events";
import { stepFilter, type StepFilter } from "./step-filter";
import { STEP_COLUMNS, type ReducedProject, type Step, type StepColumn } from "./types";

export type ListColumn = "key" | "step" | "owner" | "status" | "due" | "waitingOn";
export type ListSort = { column: ListColumn | "attention"; direction: "asc" | "desc" };
export const DEFAULT_SORT: ListSort = { column: "attention", direction: "asc" };
export type ListContext = { day: number; me: string | null };
export const stepKey = (step: Step) => step.external?.key ?? step.id;
const compareText = (a: string, b: string) => a.localeCompare(b, "en", { numeric: true, sensitivity: "base" });
const late = (step: Step, day: number) => !step.dropped && step.column !== "done" && step.dueDay !== null && step.dueDay < day;
const due = (step: Step) => step.dueDay ?? Infinity;

/** Filtering and sorting are local to this tool; the project's priority order never changes. */
export function listRows(p: ReducedProject, filter: StepFilter, sort: ListSort, ctx: ListContext): Step[] {
  const value = (s: Step): string => sort.column === "key" ? stepKey(s) : sort.column === "step" ? s.text : sort.column === "owner" ? s.owner ?? "" : s.waitingOn?.name ?? s.waitingOn?.userId ?? p.helpAsks.filter((ask) => ask.stepId === s.id && ask.answeredDay === null).map((ask) => ask.text).join(" · ");
  return [...stepFilter(p, { ...filter, hideOldDone: false }, ctx)].sort((a, b) => {
    let order = 0;
    if (sort.column === "attention") {
      order = Number(late(b, ctx.day)) - Number(late(a, ctx.day)) || Number(b.column === "blocked" && !b.dropped) - Number(a.column === "blocked" && !a.dropped);
      if (!order) order = due(a) === due(b) ? 0 : due(a) < due(b) ? -1 : 1;
    } else if (sort.column === "due") order = due(a) === due(b) ? 0 : due(a) < due(b) ? -1 : 1;
    else if (sort.column === "status") order = STEP_COLUMNS.indexOf(a.column) - STEP_COLUMNS.indexOf(b.column);
    else order = compareText(value(a), value(b));
    return (sort.direction === "desc" ? -order : order) || compareText(stepKey(a), stepKey(b)) || compareText(a.id, b.id);
  });
}

type CellEvent = { type: "project.step.moved" | "project.step.edited"; payload: EventPayload };
export function cellEdit(step: Step, column: "status", value: StepColumn): CellEvent;
export function cellEdit(step: Step, column: "owner", value: { userId: string; name: string } | null): CellEvent;
export function cellEdit(step: Step, column: "due", value: number | null): CellEvent;
/** Blocked is submitted only after MarkBlockedForm has collected the reason and waiting-on. */
export function cellEdit(step: Step, ...[column, value]:
  | [column: "status", value: StepColumn]
  | [column: "owner", value: { userId: string; name: string } | null]
  | [column: "due", value: number | null]
): CellEvent {
  if (column === "status") return { type: "project.step.moved", payload: { stepId: step.id, to: value } };
  if (column === "owner") {
    return { type: "project.step.edited", payload: { stepId: step.id, owner: value?.name ?? "", ownerUserId: value?.userId ?? null } };
  }
  return { type: "project.step.edited", payload: { stepId: step.id, dueDay: value } };
}
