// What the Timeline tool draws (plan PLN, D6). Pure: the project, the grouping, the scale and today in, plain rows out; a drag or a 'Dates…' edit
// in, one project.step.edited change and its undo out. Days are the project's own days (working days where it uses them).
import type { ReducedProject, Step, StepColumn } from "./types";

export type TimelineGroupBy = "milestone" | "person" | "status" | "none";
export type TimelineScale = "weeks" | "months" | "quarters";
export const TIMELINE_GROUPS: readonly TimelineGroupBy[] = ["milestone", "person", "status", "none"];
export const TIMELINE_SCALES: readonly TimelineScale[] = ["weeks", "months", "quarters"];
export type BarTone = "done" | "doing" | "waiting" | "blocked" | "late" | "todo";
export type Bar = { start: number; end: number };

/** A bar's start: the planned start, else the day the step first went to Doing, else the day it was added. Its end: the due day, else start + 1. Never shorter than a day. */
export function barOf(step: Pick<Step, "startDay" | "startedDay" | "addedDay" | "dueDay">): Bar {
  const start = step.startDay ?? step.startedDay ?? step.addedDay;
  const end = step.dueDay ?? start + 1;
  return { start, end: Math.max(end, start + 1) };
}

export type StepDates = { startDay?: number | null; dueDay?: number | null };
export type DateEdit = { edit: StepDates; undo: StepDates };

/** One drag: `move` shifts both ends, `start` and `end` change one. Release sends `edit` as one project.step.edited; `undo` holds the old values. */
export function dragEdit(step: Pick<Step, "startDay" | "startedDay" | "addedDay" | "dueDay">, { part, days }: { part: "move" | "start" | "end"; days: number }): DateEdit | null {
  const bar = barOf(step);
  const old = { startDay: step.startDay ?? null, dueDay: step.dueDay ?? null };
  if (!Number.isInteger(days) || days === 0) return null;
  if (part === "move") return { edit: { startDay: bar.start + days, dueDay: bar.end + days }, undo: old };
  if (part === "start") {
    const startDay = Math.min(bar.start + days, bar.end - 1);
    return startDay === bar.start && old.startDay !== null ? null : { edit: { startDay }, undo: { startDay: old.startDay } };
  }
  const dueDay = Math.max(bar.end + days, bar.start + 1);
  return dueDay === bar.end && old.dueDay !== null ? null : { edit: { dueDay }, undo: { dueDay: old.dueDay } };
}

/** The 'Dates…' fields: both days at once, due on or after start. Null when nothing changes or the days do not fit. */
export function datesEdit(step: Pick<Step, "startDay" | "startedDay" | "addedDay" | "dueDay">, input: { start: number | null; due: number | null }): DateEdit | null {
  const { start, due } = input;
  if (start !== null && due !== null && due < start) return null;
  const old = { startDay: step.startDay ?? null, dueDay: step.dueDay ?? null };
  if (start === old.startDay && due === old.dueDay) return null;
  return { edit: { startDay: start, dueDay: due }, undo: old };
}

export type TimelineRow = { stepId: string; text: string; key: string | null; bar: Bar; column: StepColumn; tone: BarTone; late: boolean; ownerUserId: string | null };
export type TimelineGroup = { id: string; by: TimelineGroupBy; title: string | null; milestoneId: string | null; userId: string | null; column: StepColumn | null; done: number; total: number; rows: TimelineRow[] };
export type TimelineColumn = { start: number; end: number };
export type TimelineView = {
  groups: TimelineGroup[];
  /** The grid's days, first included, last excluded, and its columns (a column per week, month or quarter). */
  from: number;
  to: number;
  columns: TimelineColumn[];
  today: number;
  /** True when no step has a bar. */
  empty: boolean;
};

const UNIT: Record<TimelineScale, { calendar: number; workdays: number }> = { weeks: { calendar: 7, workdays: 5 }, months: { calendar: 30, workdays: 21 }, quarters: { calendar: 91, workdays: 63 } };
const STATUS_ORDER: StepColumn[] = ["todo", "doing", "blocked", "done"];

function toneOf(step: Step, day: number): BarTone {
  if (step.column === "done") return "done";
  if (step.column === "blocked") return step.waitingOn !== null && step.waitingOn.kind !== "nobody" ? "waiting" : "blocked";
  if (step.dueDay !== null && day > step.dueDay) return "late";
  return step.column === "doing" ? "doing" : "todo";
}

export function timelineRows(p: Pick<ReducedProject, "steps" | "milestones">, { groupBy, scale, day, workdays = false }: { groupBy: TimelineGroupBy; scale: TimelineScale; day: number; workdays?: boolean }): TimelineView {
  const steps = p.steps.filter((s) => !s.dropped);
  const rows = steps.map((s): TimelineRow & { step: Step } => {
    const bar = barOf(s);
    return { step: s, stepId: s.id, text: s.text, key: s.external?.key ?? null, bar, column: s.column, tone: toneOf(s, day), late: s.column !== "done" && s.dueDay !== null && day > s.dueDay, ownerUserId: s.ownerUserId ?? null };
  });
  const strip = ({ step, ...row }: TimelineRow & { step: Step }): TimelineRow => { void step; return row; };
  const group = (id: string, extra: Partial<TimelineGroup>, members: (TimelineRow & { step: Step })[]): TimelineGroup => ({
    id, by: groupBy, title: null, milestoneId: null, userId: null, column: null, ...extra,
    done: members.filter((r) => r.column === "done").length, total: members.length, rows: members.map(strip),
  });

  let groups: TimelineGroup[];
  if (groupBy === "none") groups = [group("all", {}, rows)];
  else if (groupBy === "status") groups = STATUS_ORDER.map((c) => group(c, { column: c }, rows.filter((r) => r.column === c))).filter((g) => g.total > 0);
  else if (groupBy === "person") {
    const ids = [...new Set(rows.map((r) => r.ownerUserId).filter((x): x is string => x !== null))];
    groups = ids.map((id) => group(`person:${id}`, { userId: id }, rows.filter((r) => r.ownerUserId === id)));
    const none = rows.filter((r) => r.ownerUserId === null);
    if (none.length > 0) groups.push(group("person:none", {}, none));
  } else {
    const known = new Set(p.milestones.map((m) => m.id));
    groups = p.milestones.map((m) => group(`milestone:${m.id}`, { milestoneId: m.id, title: m.title }, rows.filter((r) => r.step.milestoneId === m.id))).filter((g) => g.total > 0);
    const none = rows.filter((r) => !r.step.milestoneId || !known.has(r.step.milestoneId));
    if (none.length > 0) groups.push(group("milestone:none", {}, none));
  }

  const unit = UNIT[scale][workdays ? "workdays" : "calendar"];
  const days = rows.flatMap((r) => [r.bar.start, r.bar.end]).concat(day);
  const from = Math.floor((Math.min(...days) - 1) / unit) * unit;
  const to = Math.ceil((Math.max(...days) + 1) / unit) * unit;
  const columns = Array.from({ length: Math.max(1, Math.round((to - from) / unit)) }, (_, i) => ({ start: from + i * unit, end: from + (i + 1) * unit }));
  return { groups, from, to: from + columns.length * unit, columns, today: day, empty: rows.length === 0 };
}

// ── the Timeline's words (en and de, German in Sie) ──
// TODO(follow-up): move these into the message catalog once PLN-A1 has merged and en.ts / de.ts can take a projectTimeline namespace.
import type { Locale } from "@/i18n";

const EN = {
  title: "Timeline",
  today: "Today",
  groupBy: "Group",
  groupMilestone: "Milestone",
  groupPerson: "Person",
  groupStatus: "Status",
  groupNone: "None",
  weeks: "Weeks",
  months: "Months",
  quarters: "Quarters",
  scale: "Scale",
  step: "Step",
  doneOf: "{done} of {total} done",
  addStep: "Add step",
  noMilestone: "No milestone",
  noOwner: "No owner",
  todo: "To do",
  doing: "Doing",
  blocked: "Blocked",
  done: "Done",
  dates: "Dates…",
  datesFor: "Dates for {step}",
  start: "Start",
  due: "Due",
  daysFromToday: "days from today",
  save: "Save",
  cancel: "Cancel",
  invalid: "The due day must not be before the start.",
  openStep: "Open step: {step}",
  dragStart: "Change the start of {step}",
  dragEnd: "Change the due day of {step}",
  moved: "{step}: {from} – {to}",
  undo: "Undo",
  syncNote: "Synced with Jira: the due day syncs, the start day stays in NextUp.",
  empty: "No steps to draw yet.",
  grid: "Timeline grid",
  notSaved: "Not saved",
};
export type TimelineText = typeof EN;
const DE: TimelineText = {
  title: "Zeitachse",
  today: "Heute",
  groupBy: "Gruppe",
  groupMilestone: "Meilenstein",
  groupPerson: "Person",
  groupStatus: "Status",
  groupNone: "Keine",
  weeks: "Wochen",
  months: "Monate",
  quarters: "Quartale",
  scale: "Massstab",
  step: "Schritt",
  doneOf: "{done} von {total} erledigt",
  addStep: "Schritt hinzufügen",
  noMilestone: "Ohne Meilenstein",
  noOwner: "Ohne Zuständige",
  todo: "Offen",
  doing: "In Arbeit",
  blocked: "Blockiert",
  done: "Erledigt",
  dates: "Daten…",
  datesFor: "Daten für {step}",
  start: "Start",
  due: "Fällig",
  daysFromToday: "Tage ab heute",
  save: "Speichern",
  cancel: "Abbrechen",
  invalid: "Fällig darf nicht vor dem Start liegen.",
  openStep: "Schritt öffnen: {step}",
  dragStart: "Start von {step} ändern",
  dragEnd: "Fälligkeit von {step} ändern",
  moved: "{step}: {from} – {to}",
  undo: "Rückgängig",
  syncNote: "Mit Jira synchronisiert: der Fälligkeitstag wird abgeglichen, der Starttag bleibt in NextUp.",
  empty: "Noch keine Schritte zum Zeichnen.",
  grid: "Zeitachsen-Raster",
  notSaved: "Nicht gespeichert",
};

export const timelineText = (locale: Locale): TimelineText => (locale === "de" ? DE : EN);
export const fill = (template: string, params: Record<string, string | number>): string => template.replace(/\{(\w+)\}/g, (_, k: string) => String(params[k] ?? ""));
