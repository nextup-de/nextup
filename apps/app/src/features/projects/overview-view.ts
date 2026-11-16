// What the Overview tool shows for a chosen range (plan HUB, D3, D6). Pure: the project, the range, today and whether the viewer is on the team in,
// plain facts out. The numbers that are a state of the board (columns, who has what, late, stuck, next due) do not move with the range; the ones that are
// something that happened (done, the per-week chart, where the waiting goes, the latest list) do.
import type { CaseEvent } from "@/features/cases/events";
import type { ReducedProject, Step, StepColumn, StepWaitingOn } from "./types";

export const OVERVIEW_RANGES = ["7d", "14d", "30d", "start"] as const;
export type OverviewRange = (typeof OVERVIEW_RANGES)[number];
export const DEFAULT_OVERVIEW_RANGE: OverviewRange = "7d";
const RANGE_DAYS: Record<Exclude<OverviewRange, "start">, number> = { "7d": 7, "14d": 14, "30d": 30 };
const MAX_WEEKS = 26;
const LATEST_LIMIT = 6;
/** A started step that has not moved for this many days is stuck: two missed weekly check-ins (Kevin, 16 Nov 2026). */
export const STUCK_DAYS = 14;

/** Is this step stuck on `day`: open, in Doing or Blocked, and unmoved for STUCK_DAYS or more? */
export const isStuck = (s: Step, day: number): boolean =>
  !s.dropped && (s.column === "doing" || s.column === "blocked") && day - s.movedDay >= STUCK_DAYS;

/** The range a `?range=` value names; anything else is the default. */
export function parseOverviewRange(value: string | null | undefined): OverviewRange {
  return OVERVIEW_RANGES.find((r) => r === value) ?? DEFAULT_OVERVIEW_RANGE;
}

export type WaitingKey = { kind: "person" | "outside" | "nobody"; userId: string | null; name: string | null };
export type OverviewFacts = {
  range: OverviewRange;
  /** First and last day of the range, both included. */
  from: number;
  to: number;
  tiles: {
    doneInRange: number;
    waiting: number;
    late: number;
    /** Days the longest-late step is past its due day; null when nothing is late. */
    oldestLateDays: number | null;
    nextDue: { stepId: string; text: string; dueDay: number } | null;
    /** Steps in Doing or Blocked that have not moved for STUCK_DAYS or more; a state of the board, so not tied to the range. */
    stuck: number;
    /** The step that has sat longest of the stuck ones; null when nothing is stuck. */
    longestStuck: { stepId: string; text: string; column: StepColumn; days: number } | null;
  };
  columns: Record<StepColumn, number>;
  /** Team only: open steps per owner, most first; an unowned step is one row with a null owner. */
  whoHasWhat: { userId: string | null; owner: string | null; todo: number; doing: number; blocked: number; total: number }[];
  /** Events inside the range, newest first, at most six: ids of project.history events (comments left out). */
  latest: { id: string; day: number }[];
  /** One count per 7-day bucket, oldest first; the last bucket ends today. */
  perWeek: { endDay: number; done: number }[];
  /** Team only: days blocked inside the range per person or supplier, most first. Empty for everyone else. */
  waiting: { key: WaitingKey; days: number }[];
  /** While the project is planning the Overview keeps the baseline panel under the tiles (D3). */
  showBaseline: boolean;
};

const isOpen = (s: Step) => !s.dropped && s.column !== "done";
const waitKey = (w: StepWaitingOn | null): WaitingKey => w ? { kind: w.kind, userId: w.userId, name: w.name } : { kind: "nobody", userId: null, name: null };
const sameKey = (a: WaitingKey, b: WaitingKey) => a.kind === b.kind && a.userId === b.userId && (a.name ?? "") === (b.name ?? "");

/** Days a step stood in Blocked inside [from, to], with who it waited on. Walks the moves; a stay still open ends today. */
function blockedStays(p: Pick<ReducedProject, "history">, s: Step, from: number, to: number): { key: WaitingKey; days: number }[] {
  const out: { key: WaitingKey; days: number }[] = [];
  let open: { since: number; key: WaitingKey } | null = null;
  const close = (end: number) => {
    if (!open) return;
    const days = Math.min(end, to + 1) - Math.max(open.since, from);
    if (days > 0) out.push({ key: open.key, days });
    open = null;
  };
  let sawMove = false;
  for (const e of p.history) {
    if (e.type !== "project.step.moved" || e.payload.stepId !== s.id) continue;
    sawMove = true;
    const next = e.payload.to;
    if (next === "blocked") {
      const w = e.payload.waitingOn;
      const key: WaitingKey = w ? { kind: w.kind, userId: w.kind === "person" ? w.userId ?? null : null, name: w.kind === "outside" ? w.name?.trim() ?? null : null }
        : open ? open.key : waitKey(null);
      if (open && sameKey(open.key, key)) continue;
      close(e.day);
      open = { since: e.day, key };
    } else if (next === "todo" || next === "doing" || next === "done") close(e.day);
  }
  // A seeded step that is blocked without a move event: its last move is the start of the stay.
  if (!sawMove && s.column === "blocked") open = { since: s.movedDay, key: waitKey(s.waitingOn) };
  close(to + 1);
  return out;
}

export function overviewFacts(p: ReducedProject, input: { range: OverviewRange; day: number; viewerOnTeam: boolean }): OverviewFacts {
  const { range, day, viewerOnTeam } = input;
  const startDay = p.startedDay ?? p.openedDay;
  const from = range === "start" ? Math.min(startDay, day) : day - RANGE_DAYS[range] + 1;
  const steps = p.steps.filter((s) => !s.dropped);
  const open = steps.filter(isOpen);
  const columns: Record<StepColumn, number> = { todo: 0, doing: 0, blocked: 0, done: 0 };
  for (const s of steps) columns[s.column]++;

  const doneDays = steps.filter((s) => s.column === "done" && s.doneDay !== null).map((s) => s.doneDay as number);
  const lateSteps = open.filter((s) => s.dueDay !== null && day > s.dueDay);
  const stuck = open.filter((s) => isStuck(s, day)).sort((a, b) => a.movedDay - b.movedDay);
  const nextDue = open.filter((s) => s.dueDay !== null && s.dueDay >= day).sort((a, b) => (a.dueDay as number) - (b.dueDay as number))[0];

  const weeks = Math.max(1, Math.min(MAX_WEEKS, Math.ceil((day - from + 1) / 7)));
  const perWeek = Array.from({ length: weeks }, (_, i) => {
    const endDay = day - (weeks - 1 - i) * 7;
    return { endDay, done: doneDays.filter((d) => d <= endDay && d > endDay - 7 && d >= from).length };
  });

  const owners = new Map<string, OverviewFacts["whoHasWhat"][number]>();
  if (viewerOnTeam) {
    for (const s of open) {
      const id = s.ownerUserId ?? null;
      const key = id ?? "name:" + (s.owner ?? "");
      const row = owners.get(key) ?? { userId: id, owner: s.owner, todo: 0, doing: 0, blocked: 0, total: 0 };
      row[s.column as "todo" | "doing" | "blocked"]++;
      row.total++;
      owners.set(key, row);
    }
  }

  const waited: OverviewFacts["waiting"] = [];
  if (viewerOnTeam) {
    for (const s of steps) {
      for (const stay of blockedStays(p, s, from, day)) {
        const hit = waited.find((w) => sameKey(w.key, stay.key));
        if (hit) hit.days += stay.days; else waited.push({ key: stay.key, days: stay.days });
      }
    }
  }

  const latest = p.history.filter((e: CaseEvent) => e.type !== "project.commented" && e.day >= from && e.day <= day).slice(-LATEST_LIMIT).reverse().map((e) => ({ id: e.id, day: e.day }));

  return {
    range, from, to: day,
    tiles: {
      doneInRange: doneDays.filter((d) => d >= from && d <= day).length,
      waiting: open.filter((s) => s.column === "blocked" && s.waitingOn !== null && s.waitingOn.kind !== "nobody").length,
      late: lateSteps.length,
      oldestLateDays: lateSteps.length ? Math.max(...lateSteps.map((s) => day - (s.dueDay as number))) : null,
      nextDue: nextDue ? { stepId: nextDue.id, text: nextDue.text, dueDay: nextDue.dueDay as number } : null,
      stuck: stuck.length,
      longestStuck: stuck[0] ? { stepId: stuck[0].id, text: stuck[0].text, column: stuck[0].column, days: day - stuck[0].movedDay } : null,
    },
    columns,
    whoHasWhat: [...owners.values()].sort((a, b) => b.total - a.total),
    latest,
    perWeek,
    waiting: waited.sort((a, b) => b.days - a.days),
    showBaseline: p.status === "planning",
  };
}
