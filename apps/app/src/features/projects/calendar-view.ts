// The Calendar tool's rules (plan PLN D5, D6): where a step sits, what is unscheduled, and the event a drop,
// a "Move to day…" or a quick add sends. Pure: the caller supplies the day <-> date mapping of its clock.
import { cellEdit } from "./list-view";
import { toStepAdded, validStep, type CreateStepInput, type StepAddedPayload } from "./create-step";
import { stepKey } from "./list-view";
import type { ReducedProject, Step, StepColumn } from "./types";

export type CalendarScale = "month" | "week";
export type CalendarOptions = {
  /** Any ISO date (YYYY-MM-DD) inside the month or week to show. */
  month: string;
  scale: CalendarScale;
  /** Today's day number. */
  day: number;
  /** The project counts working days: Saturday and Sunday are not shown. */
  workdays: boolean;
  /** ISO date of a day number (null: no such date). */
  dateOf: (day: number) => string | null;
  /** Day number of an ISO date (null: not a day steps can be due, e.g. a weekend or holiday on a working-day clock). */
  dayOf: (date: string) => number | null;
};
export type CalendarChip = { stepId: string; key: string; title: string; column: StepColumn; late: boolean; done: boolean };
export type CalendarCell = { date: string; day: number | null; inPeriod: boolean; today: boolean; chips: CalendarChip[] };

const MS = 86_400_000;
const toMs = (iso: string) => Date.parse(`${iso}T12:00:00Z`);
const toIso = (ms: number) => new Date(ms).toISOString().slice(0, 10);
const weekday = (iso: string) => (new Date(toMs(iso)).getUTCDay() + 6) % 7; // Monday = 0
export const SHORT_TITLE = 28;

const short = (text: string) => text.length > SHORT_TITLE ? text.slice(0, SHORT_TITLE - 1).trimEnd() + "…" : text;
const live = (step: Step) => !step.dropped;

/** The weeks of the shown period, Monday first, each with its cells and the steps due on them. */
export function calendarWeeks(p: Pick<ReducedProject, "steps">, o: CalendarOptions): CalendarCell[][] {
  const anchor = toMs(o.month);
  const first = o.scale === "month" ? toMs(o.month.slice(0, 8) + "01") : anchor;
  const last = o.scale === "month" ? toMs(toIso(Date.UTC(new Date(first).getUTCFullYear(), new Date(first).getUTCMonth() + 1, 0, 12))) : anchor;
  const start = first - weekday(toIso(first)) * MS;
  const month = o.month.slice(0, 7);
  const byDate = new Map<string, CalendarChip[]>();
  for (const step of p.steps) {
    if (!live(step) || step.dueDay === null) continue;
    const date = o.dateOf(step.dueDay);
    if (!date) continue;
    const done = step.column === "done";
    const chip: CalendarChip = { stepId: step.id, key: stepKey(step), title: short(step.text), column: step.column, done, late: !done && step.dueDay < o.day };
    byDate.set(date, [...(byDate.get(date) ?? []), chip]);
  }
  const weeks: CalendarCell[][] = [];
  for (let ms = start; ms <= last; ms += 7 * MS) {
    const cells: CalendarCell[] = [];
    for (let d = 0; d < (o.workdays ? 5 : 7); d++) {
      const date = toIso(ms + d * MS);
      const day = o.dayOf(date);
      const inPeriod = o.scale === "week" || date.startsWith(month);
      cells.push({ date, day, inPeriod, today: day !== null && day === o.day, chips: byDate.get(date) ?? [] });
    }
    weeks.push(cells);
  }
  return weeks;
}

/** Steps nobody dated yet, still open, in the order they were added. */
export function unscheduled(p: Pick<ReducedProject, "steps">): Step[] {
  return p.steps.filter((step) => live(step) && step.dueDay === null && step.column !== "done");
}

/** A drop, or "Move to day…", on a day: one project.step.edited with the new due day; nothing when it changes nothing. */
export function dropOnDay(step: Step, day: number | null) {
  if (day === null || !live(step) || step.dueDay === day) return null;
  return cellEdit(step, "due", day);
}

/** The quick add on an empty day: one project.step.added due that day (null for an empty title). */
export function quickAdd(day: number | null, title: string, ids: (prefix: "s") => string, extra: Pick<CreateStepInput, "column" | "owner" | "ownerUserId"> = {}): { type: "project.step.added"; payload: StepAddedPayload } | null {
  if (day === null) return null;
  const input: CreateStepInput = { title, dueDay: day, ...extra };
  if (!validStep(input)) return null;
  return { type: "project.step.added", payload: toStepAdded(input, undefined, ids) };
}

/** The first of the month (or the week's Monday) n periods away, as an ISO date. */
export function shiftPeriod(date: string, scale: CalendarScale, by: number): string {
  if (scale === "week") return toIso(toMs(date) + by * 7 * MS);
  const d = new Date(toMs(date));
  return toIso(Date.UTC(d.getUTCFullYear(), d.getUTCMonth() + by, 1, 12));
}
