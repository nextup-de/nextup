// What the project pages read off the reduced projects: who sees which, the groups of the list, the
// desk of moves, the brief's suggestions, the wait lines and the timeline. Pure: state in, plain
// facts (and the short sentences built from them) out. The shapes and rules are ./types, ./reduce,
// ./selectors and ./permissions; this file only reads them.
import type { Role } from "@/config/roles";
import type { CaseEvent } from "@/features/cases/events";
import type { State } from "@/features/cases/reducer";
import type { Initiative, InitiativeStatus } from "@/features/demo/types";
import { splitBody } from "@/features/ideas/brief";
import type { RewardRule } from "@/features/loop/rules";
import { nextMove, type ProjectMove } from "./selectors";
import type { Baseline, Measure, ProjectStatus, ReducedProject, Step, StepColumn } from "./types";

/** Who is looking: their role, their name and - when they post anonymously - their handle. */
export type Viewer = { role: Role; name: string; handle: string | null };

const isViewer = (v: Viewer) => (who: string | null) => who !== null && (who === v.name || (v.handle !== null && who === v.handle));

/** A handle, not a name: the author posted anonymously and stays that way. */
export const isHandle = (who: string) => who.startsWith("Anonymous");

/**
 * The projects this person may see. Members: the projects of their own ideas and the ones they are
 * on. Leaders and managers: all. With demo data off, only what happened here (no seed projects).
 */
export function visibleProjects(state: Pick<State, "projects">, v: Viewer, demo = true): ReducedProject[] {
  const all = demo ? state.projects : state.projects.filter((p) => !p.seed);
  if (v.role !== "member") return all;
  const me = isViewer(v);
  return all.filter((p) => me(p.lead) || p.members.some(me) || p.authors.some(me));
}

export type ProjectGroup = { key: string; label: string; projects: ReducedProject[] };

const GROUPS: { key: string; label: string; has: readonly ProjectStatus[] }[] = [
  { key: "planning", label: "Planning", has: ["planning"] },
  { key: "running", label: "Running", has: ["running"] },
  { key: "measuring", label: "Measuring", has: ["measuring"] },
  { key: "measured", label: "Measured and recognised", has: ["measured", "recognised"] },
  { key: "stopped", label: "Stopped", has: ["stopped"] },
];

/** The list's groups, in the order a project moves through them. Late ones first, then by number. Empty groups stay (the page hides them). */
export function groupProjects(list: readonly ReducedProject[]): ProjectGroup[] {
  return GROUPS.map((g) => ({
    key: g.key,
    label: g.label,
    projects: list.filter((p) => g.has.includes(p.status)).sort((a, b) => Number(b.overdue) - Number(a.overdue) || a.number - b.number),
  }));
}

/** The lead's next move, as the button or the card says it. */
export const MOVE_LABEL: Record<NonNullable<ProjectMove>, string> = {
  baseline: "Take the baseline",
  start: "Start the project",
  steps: "Work the board",
  done: "Mark it done",
  measure: "Record the measure",
  reward: "Record the reward",
};

export type DeskItem = { project: ReducedProject; move: NonNullable<ProjectMove>; why: "lead" | "escalated" | "reward" };

// What is most pressing first: a late move, then the moves that unblock the loop, then the board.
const MOVE_RANK: Record<NonNullable<ProjectMove>, number> = { measure: 0, start: 1, baseline: 2, reward: 3, done: 4, steps: 5 };

/**
 * The projects waiting on this person: their next move as the lead, a late start or measure that
 * moved to them as the deputy (or the route's owner), and - for a manager - a reward that is due.
 */
export function projectDesk(list: readonly ReducedProject[], day: number, v: Viewer): DeskItem[] {
  const me = isViewer(v);
  const out: DeskItem[] = [];
  for (const p of list) {
    const move = nextMove(p, day);
    if (!move) continue;
    if (move === "reward") {
      if (v.role === "manager") out.push({ project: p, move, why: "reward" });
    } else if (me(p.lead)) out.push({ project: p, move, why: "lead" });
    else if (p.escalated && me(p.escalated.to)) out.push({ project: p, move, why: "escalated" });
  }
  return out.sort((a, b) => Number(b.project.overdue) - Number(a.project.overdue) || MOVE_RANK[a.move] - MOVE_RANK[b.move] || a.project.number - b.project.number);
}

// ── AI suggests, people decide: the offline proposals, read from the source case's brief ──

const norm = (s: string) => s.toLowerCase().replace(/\s+/g, " ").trim();
const lowerFirst = (s: string) => s.charAt(0).toLowerCase() + s.slice(1);
const STEP_LINES: Record<string, (text: string) => string> = {
  "first step": (t) => t,
  then: (t) => t,
  "still open": (t) => "Clear up: " + lowerFirst(t),
};

export type StepHint = { label: string; text: string };

/** The brief's "First step", "Then" and "Still open" lines as steps - minus the ones already on the board. */
export function suggestedSteps(body: string, steps: readonly Pick<Step, "text">[]): StepHint[] {
  const have = new Set(steps.map((s) => norm(s.text)));
  const out: StepHint[] = [];
  for (const f of splitBody(body).facts) {
    const make = STEP_LINES[norm(f.label)];
    if (!make) continue;
    const text = make(f.text);
    if (!have.has(norm(text)) && !out.some((x) => norm(x.text) === norm(text))) out.push({ label: f.label, text });
  }
  return out;
}

export type BaselineHint = { metric: string; unit: string; better: "up" | "down" | null; goal: string };

const LOWER = /^(under|below|less than|fewer than|at most|max(?:imum)?)$/i;
const TIME_UNITS = /^(s|sec|seconds?|min|mins|minutes?|h|hrs?|hours?|days?|weeks?)$/i;
const LEADING = /^(every|each|all|the|a|an|our)\s+/i;

/**
 * What to measure, read from the brief's Goal line ("*Goal* Every changeover under 20 minutes" ->
 * changeover time, minutes, lower is better). Without a goal, the idea's KPI names the metric and
 * the lead says which way is better. Null when there is nothing to go on.
 */
export function suggestedBaseline(body: string, kpi?: string | null): BaselineHint | null {
  const goal = splitBody(body).facts.find((f) => norm(f.label) === "goal")?.text ?? "";
  const m = /^(.*?)\s*\b(under|below|less than|fewer than|at most|over|above|more than|at least)\s+[€$]?\s*([\d.,]+)\s*(%|[^\s,.;]+)?/i.exec(goal);
  if (m) {
    const unit = (m[4] ?? "").trim();
    let metric = m[1].replace(LEADING, "").trim();
    if (metric && !metric.includes(" ") && TIME_UNITS.test(unit)) metric += " time";
    return { metric: metric || goal, unit, better: LOWER.test(m[2]) ? "down" : "up", goal };
  }
  if (goal) return { metric: goal, unit: "", better: null, goal };
  return kpi ? { metric: kpi, unit: "", better: null, goal: "" } : null;
}

// ── links ──

/** A link people typed, as an href: http(s) only, so a "javascript:" address never becomes a link. */
export const safeUrl = (url: string | undefined | null): string | null => (url && /^https?:\/\/[^\s]+$/i.test(url.trim()) ? url.trim() : null);

/** A Jira-style key ("FS-12") says which system a link is in; anything else is a plain address. */
export const systemOf = (key: string) => (/^[A-Z][A-Z0-9]+-\d+$/.test(key.trim()) ? "jira" : "url");

// ── numbers ──

/** 11, 2.5, 1,200 - never more than two decimals. */
export const fmtNumber = (n: number) => n.toLocaleString("en-GB", { maximumFractionDigits: 2 });

/** "35 → 11 days": the baseline against a measure, in the baseline's unit. */
export function movement(b: Baseline | null, m: Pick<Measure, "value">): string {
  if (!b || b.none) return fmtNumber(m.value);
  return fmtNumber(b.value) + " → " + fmtNumber(m.value) + (b.unit ? " " + b.unit : "");
}

/** "+37.5 %" / "−68.6 %" / "" when there is no percent (a zero baseline, or none). */
export const changeText = (pct: number | null) => (pct === null ? "" : (pct > 0 ? "+" : pct < 0 ? "−" : "±") + fmtNumber(Math.abs(pct)) + " %");

/** The baseline in one line: "35 days · time to first productive day · lower is better". */
export function baselineText(b: Baseline): string {
  if (b.none) return "No number possible: " + b.why;
  return fmtNumber(b.value) + (b.unit ? " " + b.unit : "") + " · " + b.metric + " · " + (b.better === "up" ? "higher" : "lower") + " is better";
}

const eur = (n: number) => "€" + n.toLocaleString("en-GB");

/** The company's reward rule in words. */
export function rewardRuleText(rule: RewardRule): string {
  switch (rule.kind) {
    case "none": return "No reward - the company gives none";
    case "thanks": return "A thank-you, on record";
    case "fixed": return rule.amount != null ? eur(rule.amount) + " for the authors" : "A fixed amount";
    case "share": return (rule.sharePct ?? 0) + "% of the measured yearly saving" + (rule.capEur != null ? ", up to " + eur(rule.capEur) : "");
  }
}

export { eur as euros };

// ── the Wait ledger, read from the projects ──

export type WaitStat = { n: number; medianDays: number | null; waiting: number };

const median = (xs: number[]): number | null => {
  if (!xs.length) return null;
  const s = [...xs].sort((a, b) => a - b), k = s.length >> 1;
  return s.length % 2 ? s[k] : Math.round(((s[k - 1] + s[k]) / 2) * 10) / 10;
};

/**
 * decided -> started (the days from the yes to the start) and done -> measured (the days from done
 * to the first measure), with how many still wait for it. Counts and medians only - nobody's speed.
 */
export function projectWaits(list: readonly ReducedProject[]): { started: WaitStat; measured: WaitStat } {
  const live = list.filter((p) => !p.stopped);
  const started = live.filter((p) => p.startedDay !== null).map((p) => (p.startedDay as number) - p.openedDay);
  const measured = live.filter((p) => p.doneDay !== null && p.measures.length).map((p) => p.measures[0].day - (p.doneDay as number));
  return {
    started: { n: started.length, medianDays: median(started), waiting: live.filter((p) => p.startedDay === null).length },
    measured: { n: measured.length, medianDays: median(measured), waiting: live.filter((p) => p.checks.length > 0 && !p.measures.length).length },
  };
}

/** Projects with a number before and after - the ones /progress can show movement for. */
export const measuredProjects = (list: readonly ReducedProject[]) => list.filter((p) => p.measures.length > 0);

// ── /collaboration: the projects as its rows ──

const COLLAB_STATUS: Record<ProjectStatus, InitiativeStatus | null> = {
  planning: "Proposed", running: "Building", measuring: "Shipped", measured: "Shipped", recognised: "Shipped", stopped: null,
};

/**
 * Projects as /collaboration's rows (it was drawn from the made-up initiatives). `deptOf` names a
 * person's department id; `whyOf` says what a project started from. Stopped projects wait nowhere,
 * so they are left out.
 */
export function asInitiatives(list: readonly ReducedProject[], deptOf: (name: string) => string | null, deptName: (id: string) => string, whyOf: (p: ReducedProject) => string): Initiative[] {
  const out: Initiative[] = [];
  for (const p of list) {
    const status = COLLAB_STATUS[p.status];
    if (!status) continue;
    const team = [p.lead, ...p.members];
    const depts = [...new Set(team.map(deptOf).filter((d): d is string => !!d))];
    const blocked = p.steps.find((s) => s.column === "blocked");
    const done = p.steps.filter((s) => s.column === "done").length;
    const stage = p.status === "planning" ? (p.overdue ? "planning, the start is late" : "planning")
      : p.status === "running" ? done + " of " + p.steps.length + " steps done"
      : p.status === "measuring" ? "done, measuring"
      : p.verdict ? "measured: " + p.verdict : "measured";
    out.push({
      id: p.id, name: p.title, depts, people: team.length, status, stage, why: whyOf(p),
      members: team.map((name, k) => ({ name, role: (k === 0 ? "Lead · " : "") + (deptOf(name) ? deptName(deptOf(name) as string) : "team") })),
      stuckOn: p.escalated ? { name: p.escalated.to, reason: p.escalated.what === "start" ? "the start is late" : "a measure is late" }
        : blocked ? { name: blocked.owner ?? p.lead, reason: "blocked: " + (blocked.why || "no reason given") } : undefined,
    });
  }
  return out;
}

// ── the timeline ──

export const COLUMN_LABEL: Record<StepColumn, string> = { todo: "To do", doing: "Doing", blocked: "Blocked", done: "Done" };

export type TimelineLine = { id: string; day: number; by: string; text: string };

/** What happened to a project, oldest first, one short line per event. Comments have their own thread, so they are left out. */
export function timelineOf(p: ReducedProject): TimelineLine[] {
  const stepText = (id: unknown) => p.steps.find((s) => s.id === id)?.text ?? "a step";
  const line = (ev: CaseEvent): string | null => {
    const pl = ev.payload ?? {};
    switch (ev.type) {
      case "case.decided": return "said yes, and the project opened" + (pl.lead ? " with " + pl.lead + " as lead" : "");
      case "project.member": return pl.on === false ? "took " + pl.name + " off the team" : "added " + pl.name + " to the team";
      case "project.handed": return "handed the lead to " + pl.to + (pl.why ? ": " + pl.why : "");
      case "project.baseline": return pl.none ? "said no number is possible: " + (pl.why ?? "") : "took the baseline: " + fmtNumber(pl.value ?? 0) + (pl.unit ? " " + pl.unit : "") + " " + (pl.metric ?? "") + (pl.source ? " (" + pl.source + ")" : "");
      case "project.started": return "started the project";
      case "project.step.added": return "added a step: " + (pl.text ?? "");
      case "project.step.moved": return "moved “" + stepText(pl.stepId) + "” to " + (COLUMN_LABEL[pl.to as StepColumn] ?? pl.to) + (pl.why ? ": " + pl.why : "");
      case "project.linked": return "linked " + (pl.key || pl.url || "a page");
      case "project.done": return "marked it done" + (pl.note ? ": " + pl.note : "");
      case "project.measured": return "recorded the " + pl.check + "-day measure: " + fmtNumber(pl.value ?? 0) + (pl.source ? " (" + pl.source + ")" : "");
      case "project.rewarded": return "recorded the reward" + (typeof pl.amount === "number" ? ": " + eur(pl.amount) : "") + (pl.note ? " - " + pl.note : "");
      case "project.claimed": return "claimed the reward";
      case "project.stopped": return "stopped it: " + (pl.why ?? "");
      default: return null;
    }
  };
  return p.history.flatMap((ev) => {
    const text = line(ev);
    return text ? [{ id: ev.id, day: ev.day, by: ev.actor, text }] : [];
  });
}
