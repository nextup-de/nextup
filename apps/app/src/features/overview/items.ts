// The Projects Overview as one list (Paper "Overview · final + interactions", A and B): every idea still moving and
// every project this person may see, side by side - where each stands, whose desk it is on, and what its status chip
// says. Facts only; the page builds the sentences. Pure: cases and projects in, items out, plus the pill counts,
// the search and the sort the page offers.
import type { ReducedCase } from "@/features/cases/reducer";
import { board, nextMove, projectLabel } from "@/features/projects/selectors";
import type { ProjectStatus, ReducedProject, VerdictWord } from "@/features/projects/types";
import type { DeskLabel } from "./rows";

export type ItemKind = "idea" | "project";

/** What the status chip says. `n`: days (late, left) or steps (blocked); `day`: a due date; `verdict`: a measured result. */
export type ItemStatus =
  | { what: "yourMove" }
  | { what: "pastPromise"; n: number }
  | { what: "daysLeft"; n: number }
  | { what: "blocked"; n: number }
  | { what: "late"; n: number }
  | { what: "recognised" }
  | { what: "verdict"; verdict: VerdictWord }
  | { what: "due"; day: number }
  | { what: "none" };

/** Where it stands: an idea on a desk (the role, or the role it moved up to), or a project in its stage with its board. */
export type ItemStage =
  | { kind: "desk"; role: string | null; movedUp: boolean }
  | { kind: "project"; status: ProjectStatus; done: number; total: number; blocked: number };

export type ItemDesk = { name: string | null; userId: string | null; you: boolean };

export type OverviewItem = {
  id: string;
  kind: ItemKind;
  /** The app path that opens it (without the company): the idea's page or the project's. */
  path: string;
  /** P-5 for a project, null for an idea. */
  key: string | null;
  title: string;
  /** An idea: who raised it and their area. Null for a project. */
  from: string | null;
  area: string | null;
  stage: ItemStage;
  desk: ItemDesk;
  status: ItemStatus;
  yourMove: boolean;
  raisedDay: number;
  updatedDay: number;
};

const lastDay = (history: readonly { day: number }[], from: number) => history.reduce((d, e) => Math.max(d, e.day), from);

/** An idea still moving. The caller decides `yourMove` (a question for the raiser, or the case on this person's desk). */
export function ideaItem(c: ReducedCase, day: number, desk: DeskLabel, yourMove: boolean): OverviewItem {
  const left = c.dueDay - day;
  const status: ItemStatus = yourMove ? { what: "yourMove" }
    : c.overdue ? { what: "pastPromise", n: Math.max(1, day - c.dueDay) }
    : { what: "daysLeft", n: Math.max(0, left) };
  return {
    id: c.id, kind: "idea", path: "/idea?id=" + encodeURIComponent(c.id), key: null, title: c.title,
    from: c.from, area: c.fromDept || null,
    stage: { kind: "desk", role: desk.escalation ?? desk.role, movedUp: desk.escalation !== null },
    desk: { name: desk.names[0] ?? null, userId: null, you: yourMove && c.status !== "asked" },
    status, yourMove, raisedDay: c.raisedDay, updatedDay: lastDay(c.history, c.raisedDay),
  };
}

/** A project. Its desk is the lead, or whoever a late move went up to; the chip says the most pressing thing first. */
export function projectItem(p: ReducedProject, day: number, userId: string | null): OverviewItem {
  const by = board(p);
  const counted = p.steps.filter((s) => !s.dropped);
  const lead = userId !== null && p.leadUserId === userId;
  const yourMove = lead && nextMove(p, day) !== null;
  const status: ItemStatus = yourMove ? { what: "yourMove" }
    : by.blocked.length > 0 ? { what: "blocked", n: by.blocked.length }
    : p.overdue && p.dueDay !== null ? { what: "late", n: Math.max(1, day - p.dueDay) }
    : p.status === "recognised" ? { what: "recognised" }
    : p.verdict && (p.status === "measuring" || p.status === "measured") ? { what: "verdict", verdict: p.verdict }
    : p.dueDay !== null ? { what: "due", day: p.dueDay }
    : { what: "none" };
  const desk: ItemDesk = p.escalated ? { name: p.escalated.to, userId: null, you: false } : { name: p.lead || null, userId: p.leadUserId, you: lead };
  return {
    id: p.id, kind: "project", path: "/projects/" + encodeURIComponent(p.id), key: projectLabel(p), title: p.title,
    from: null, area: null,
    stage: { kind: "project", status: p.status, done: counted.filter((s) => s.column === "done").length, total: counted.length, blocked: by.blocked.length },
    desk, status, yourMove, raisedDay: p.openedDay, updatedDay: lastDay(p.history, p.openedDay),
  };
}

/** The ideas the Overview lists: still moving (open or waiting on a question), not archived, not withdrawn. */
export const listedIdea = (c: Pick<ReducedCase, "archived" | "withdrawn" | "open" | "status">) =>
  !c.archived && !c.withdrawn && (c.open || c.status === "asked");

/** The projects it lists: every one but a stopped one. */
export const listedProject = (p: Pick<ReducedProject, "status">) => p.status !== "stopped";

// ── the pills, the search and the sort ──

export type Show = "all" | "ideas" | "projects" | "move";
export const SHOWS: readonly Show[] = ["all", "ideas", "projects", "move"];
export const isShow = (s: string | null): s is Show => s !== null && (SHOWS as readonly string[]).includes(s);

const SHOW_TEST: Record<Show, (i: OverviewItem) => boolean> = {
  all: () => true, ideas: (i) => i.kind === "idea", projects: (i) => i.kind === "project", move: (i) => i.yourMove,
};

export const showItems = (items: readonly OverviewItem[], show: Show) => items.filter(SHOW_TEST[show]);

export const showCounts = (items: readonly OverviewItem[]): Record<Show, number> =>
  ({ all: items.length, ideas: showItems(items, "ideas").length, projects: showItems(items, "projects").length, move: showItems(items, "move").length });

/** Every word of the query somewhere in the title, the key, who raised it, the area or the desk. */
export function searchItems(items: readonly OverviewItem[], query: string): OverviewItem[] {
  const words = query.toLowerCase().split(/\s+/).filter(Boolean);
  if (!words.length) return [...items];
  return items.filter((i) => {
    const hay = [i.title, i.key, i.from, i.area, i.desk.name, i.stage.kind === "desk" ? i.stage.role : null].filter(Boolean).join(" ").toLowerCase();
    return words.every((w) => hay.includes(w));
  });
}

/** Only the items on one person's desk (the person card's "Show only theirs"). */
export const deskItems = (items: readonly OverviewItem[], name: string) => items.filter((i) => i.desk.name === name);

export type SortKey = "needs" | "updated" | "raised" | "stage" | "name";
export const SORT_KEYS: readonly SortKey[] = ["needs", "updated", "raised", "stage", "name"];
export type SortDir = "newest" | "oldest";

/** How pressing an item is: your move, then late or blocked, then due within a day, then the rest. */
export function urgency(i: OverviewItem): number {
  const s = i.status;
  if (s.what === "yourMove") return 0;
  if (s.what === "pastPromise" || s.what === "late" || s.what === "blocked") return 1;
  if (s.what === "daysLeft" && s.n <= 1) return 2;
  return 3;
}

const daysLeftOf = (i: OverviewItem) => (i.status.what === "daysLeft" ? i.status.n : i.status.what === "due" ? i.status.day : Infinity);
const STAGE_RANK: Record<string, number> = { desk: 0, planning: 1, running: 2, measuring: 3, measured: 4, recognised: 5, stopped: 6 };
const stageRank = (i: OverviewItem) => STAGE_RANK[i.stage.kind === "desk" ? "desk" : i.stage.status];

/**
 * "Needs you first" (the default): urgency, then the least time left, then the latest change. The other keys sort by
 * that column; `dir` turns dates round (newest first by default) and names and stages too.
 */
export function sortItems(items: readonly OverviewItem[], key: SortKey, dir: SortDir = "newest"): OverviewItem[] {
  const flip = dir === "oldest" ? -1 : 1;
  const out = [...items];
  if (key === "needs") return out.sort((a, b) => urgency(a) - urgency(b) || daysLeftOf(a) - daysLeftOf(b) || b.updatedDay - a.updatedDay);
  if (key === "updated") return out.sort((a, b) => flip * (b.updatedDay - a.updatedDay) || a.title.localeCompare(b.title));
  if (key === "raised") return out.sort((a, b) => flip * (b.raisedDay - a.raisedDay) || a.title.localeCompare(b.title));
  if (key === "stage") return out.sort((a, b) => flip * (stageRank(a) - stageRank(b)) || urgency(a) - urgency(b));
  return out.sort((a, b) => flip * a.title.localeCompare(b.title));
}

/** What the person card counts: how many of the listed items sit on that desk, and how many of those are past their promise. */
export function deskStats(items: readonly OverviewItem[], name: string): { held: number; late: number } {
  const mine = deskItems(items, name);
  return { held: mine.length, late: mine.filter((i) => i.status.what === "pastPromise" || i.status.what === "late").length };
}
