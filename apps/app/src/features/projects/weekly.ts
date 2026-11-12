// The offline draft of a project's weekly update (plan MOV, D21, Q6.9). Pure: no model call, no network. It reads
// what the board did between two check-in days from the project's own events and writes it as a few lines the lead
// edits and sends (MOV-U1). Which days are check-in days is rhythm.ts's business, never counted by hand here.
import type { ClockSpec } from "@/features/clock";
import { translate, type Locale } from "@/i18n";
import { checkInDayOf, previousCheckInDayOf } from "./rhythm";
import type { ReducedProject, StepColumn } from "./types";

const COLUMNS: readonly string[] = ["todo", "doing", "blocked", "done"];
const isColumn = (v: unknown): v is StepColumn => typeof v === "string" && COLUMNS.includes(v);

/**
 * The text of the draft for the events with `fromDay < day <= toDay`: a heading with the project, then one line each
 * for the steps added, moved on (to Doing), done and blocked (with what blocks them). A step appears once per line, with
 * its current text; a step that was removed is left out. A move that kept the column (a reorder) is not a move on.
 * When nothing happened the heading is followed by the "nothing moved" line.
 */
export function weeklyDraft(p: Pick<ReducedProject, "number" | "title" | "history" | "steps">, fromDay: number, toDay: number, locale: Locale): string {
  const t = (key: Parameters<typeof translate>[1], params?: Record<string, string | number>) => translate(locale, key, params);
  const added: string[] = [];
  const moved: string[] = [];
  const done: string[] = [];
  const blocked = new Map<string, string>();
  const note = (list: string[], id: string) => { if (!list.includes(id)) list.push(id); };

  // Replayed from the start, so a move is judged against the column the step really came from.
  const column = new Map<string, StepColumn>();
  for (const ev of p.history) {
    const id = ev.payload.stepId;
    if (!id) continue;
    const inWindow = ev.day > fromDay && ev.day <= toDay;
    if (ev.type === "project.step.added") {
      if (column.has(id)) continue;
      const start = ev.payload.to;
      column.set(id, isColumn(start) && start !== "blocked" ? start : "todo");
      if (inWindow) note(added, id);
    } else if (ev.type === "project.step.moved") {
      const dest = ev.payload.to;
      const was = column.get(id);
      if (was === undefined || !isColumn(dest)) continue;
      column.set(id, dest);
      if (!inWindow || was === dest) continue;
      if (dest === "doing") note(moved, id);
      else if (dest === "done") note(done, id);
      else if (dest === "blocked") blocked.set(id, (ev.payload.why ?? "").trim());
    }
  }

  const textOf = (id: string) => p.steps.find((s) => s.id === id)?.text ?? null;
  const names = (ids: Iterable<string>, withWhy?: Map<string, string>) =>
    [...ids].flatMap((id) => {
      const text = textOf(id);
      if (text === null) return [];
      const why = withWhy?.get(id);
      return [why ? `${text} (${why})` : text];
    }).join("; ");

  const lines: [string, string][] = [
    ["projectMove.weeklyAdded", names(added)],
    ["projectMove.weeklyMoved", names(moved)],
    ["projectMove.weeklyDone", names(done)],
    ["projectMove.weeklyBlocked", names(blocked.keys(), blocked)],
  ];
  const body = lines.filter(([, steps]) => steps !== "").map(([key, steps]) => t(key as "projectMove.weeklyAdded", { steps }));
  const heading = t("projectMove.weeklyHeading", { label: `P-${p.number}: ${p.title}` });
  return [heading, ...(body.length ? body : [t("projectMove.weeklyNothing")])].join("\n");
}

/**
 * The check-in day this week's draft starts after: the week of the latest sent update when it is before `checkInDay`
 * and itself a scheduled check-in day of the project's current rhythm (one from an edited rhythm or a week that has since
 * lost its day is not a boundary), else the previous scheduled check-in. Never before the start: the first week's
 * window opens at the start day. The window is (from, to], so an event is in exactly one week's draft.
 */
export function previousCheckIn(p: Pick<ReducedProject, "latestUpdate" | "startedDay" | "checkInWeekday">, checkInDay: number, clock: ClockSpec): number {
  const sent = p.latestUpdate?.week;
  if (sent !== undefined && sent < checkInDay && checkInDayOf(p, sent, clock) === sent) return sent;
  const before = previousCheckInDayOf(p, checkInDay, clock);
  return before ?? p.startedDay ?? checkInDay;
}
