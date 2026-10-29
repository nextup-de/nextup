// What the project pages read off the reduced projects: who sees which, the groups of the list, the
// desk of moves, the brief's suggestions, the wait lines and the timeline. Pure: state in, plain
// facts (and the short sentences built from them) out. The shapes and rules are ./types, ./reduce,
// ./selectors and ./permissions; this file only reads them.
import type { Role } from "@/config/roles";
import type { CaseEvent } from "@/features/cases/events";
import type { State } from "@/features/cases/reducer";
import type { Initiative, InitiativeStatus } from "@/features/demo/types";
import { splitBody } from "@/features/ideas/brief";
import type { JiraStatusView } from "@/features/integrations/jira/types";
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

// ── the tools a project connects to (docs/plans/2026-10-15_idea-to-project.md §6) ──

export type ToolId = "jira" | "azure" | "planner" | "teams" | "sharepoint" | "polarion" | "codebeamer" | "url";

/**
 * The tools a project can be connected to. "sync": the app can run the sync itself - new steps go out,
 * status and comments come back (Jira today, if the company's admin switched it on: jiraRowOf below).
 * "link": the
 * page keeps the address and the keys; the work itself stays in that tool.
 */
export type Tool = { id: ToolId; name: string; short: string; what: string; sync: "sync" | "link"; host: RegExp | null };

export const TOOLS: readonly Tool[] = [
  { id: "jira", name: "Jira", short: "JI", what: "An epic for the project, an issue per step. Status and comments come back.", sync: "sync", host: /atlassian\.net$|(^|\.)jira\./i },
  { id: "azure", name: "Azure DevOps", short: "AZ", what: "Work items for the steps, under one feature.", sync: "link", host: /(^|\.)dev\.azure\.com$|visualstudio\.com$/i },
  { id: "planner", name: "Microsoft Planner", short: "PL", what: "A plan with one task per step.", sync: "link", host: /planner\.cloud\.microsoft$|tasks\.office\.com$/i },
  { id: "teams", name: "Microsoft Teams", short: "TE", what: "The channel the team talks in.", sync: "link", host: /teams\.microsoft\.com$|teams\.live\.com$/i },
  { id: "sharepoint", name: "SharePoint", short: "SP", what: "The folder the files and drawings live in.", sync: "link", host: /sharepoint\.com$|onedrive\.live\.com$/i },
  { id: "polarion", name: "Polarion", short: "PO", what: "Requirements and test runs.", sync: "link", host: /polarion/i },
  { id: "codebeamer", name: "codebeamer", short: "CB", what: "Requirements and test runs.", sync: "link", host: /codebeamer/i },
];

const OTHER: Tool = { id: "url", name: "Other links", short: "↗", what: "Any other page.", sync: "link", host: null };

export const toolOf = (id: string): Tool => TOOLS.find((t) => t.id === id) ?? OTHER;

/** Which tool a link is in: its address first (dev.azure.com, *.sharepoint.com), then a Jira-style key. */
export function systemFrom(url: string, key = ""): ToolId {
  const host = url.trim().replace(/^https?:\/\//i, "").split(/[/?#]/)[0] ?? "";
  const byHost = host ? TOOLS.find((t) => t.host?.test(host)) : undefined;
  if (byHost) return byHost.id;
  return key.trim() && systemOf(key) === "jira" ? "jira" : "url";
}

export type ToolLink = { url: string | null; key: string; stepId: string | null; day: number };
export type Connection = { tool: Tool; links: ToolLink[]; steps: number };

/** Per tool: the project's links into it and how many steps carry a key there. Connected tools first; "Other links" only when there are some. */
export function connectionsOf(p: Pick<ReducedProject, "links" | "steps">): Connection[] {
  const rows = [...TOOLS, OTHER].map((tool): Connection => ({
    tool,
    links: p.links.filter((l) => toolOf(l.system).id === tool.id).map((l) => ({ url: safeUrl(l.url), key: l.key, stepId: l.stepId, day: l.day })),
    steps: p.steps.filter((s) => s.external && toolOf(s.external.system).id === tool.id).length,
  }));
  const on = (r: Connection) => r.links.length > 0 || r.steps > 0;
  return rows.filter((r) => r.tool.id !== "url" || on(r)).sort((a, b) => Number(on(b)) - Number(on(a)));
}

// ── the Jira row of the tools panel (docs/plans/2026-10-29_jira-in-app.md, "Lead UI") ──

/** One Jira link of a project, for the row's chips. */
export type JiraRowChip = { tone: "sending" | "ok" | "problem"; text: string };

/**
 * What the Jira row says about one project. `off`: the company's Jira sync is not switched on (the row
 * is a plain link row). `ready`: it is on and the project is not sent. `synced`: the project is sent
 * (or the company's auto-epic rule did it).
 */
export type JiraRow = {
  state: "off" | "ready" | "synced";
  /** The mode tag on the row: "Link" while the sync is off, "Two-way sync" while it can run. */
  label: "Link" | "Two-way sync";
  /** The line under the name for `off` and `ready`; empty when synced (the chip speaks). */
  hint: string;
  /** "Send to Jira" while `ready`, else null. */
  send: string | null;
  /** Only while `synced`. */
  chip: JiraRowChip | null;
  projectKey: string | null;
  siteUrl: string | null;
  /** The project's epic once there is one (a link with no step). */
  epicKey: string | null;
  /** Can a person link an existing issue? Needs the sync on and the site address. */
  canLink: boolean;
  /** Steps with no key yet say "waiting for Jira". */
  waiting: boolean;
};

/** "just now", "3 min ago", "2 h ago", "4 days ago" - for "checked … ago". */
export function agoText(iso: string, nowMs: number): string {
  const ms = nowMs - Date.parse(iso);
  if (!Number.isFinite(ms) || ms < 60_000) return "just now";
  const min = Math.floor(ms / 60_000);
  if (min < 60) return min + " min ago";
  const h = Math.floor(min / 60);
  if (h < 24) return h + " h ago";
  const d = Math.floor(h / 24);
  return d + (d === 1 ? " day ago" : " days ago");
}

/** The local demo has no Jira; its stand-in is "NUP" on a host that never resolves (DemoProvider's act.project.sync plays the connector). */
export const DEMO_JIRA_KEY = "NUP";
export const DEMO_JIRA_SITE = "https://jira.demo.invalid";

/** The company's Jira as the local demo shows it: switched on, nothing to configure, always just checked. */
export function demoJiraView(nowMs: number): JiraStatusView {
  return {
    configured: true, on: true, enabledAt: null, siteUrl: DEMO_JIRA_SITE, projectKey: DEMO_JIRA_KEY, hasToken: true, hasWebhookSecret: false,
    account: null, lastRunAt: new Date(nowMs).toISOString(), lastOkAt: new Date(nowMs).toISOString(), lastError: null, tokenExpired: false,
    linked: null, problems: [],
  };
}

const plural = (n: number, one: string, many: string) => n + " " + (n === 1 ? one : many);

/**
 * The Jira row for one project: pure, so it is tested without a screen. `view` is the company's
 * integration as the server built it (jiraStatusView), null where there is none (the static demo,
 * no database) - which reads as off. The row never shows more than the view holds: no secrets.
 */
export function jiraRowOf(p: Pick<ReducedProject, "sync" | "links" | "steps" | "id">, view: JiraStatusView | null, nowMs: number): JiraRow {
  if (!view || !view.on) {
    return {
      state: "off", label: "Link", hint: "Your admin can switch the Jira sync on", send: null, chip: null,
      projectKey: view?.projectKey ?? null, siteUrl: null, epicKey: null, canLink: false, waiting: false,
    };
  }
  const key = view.projectKey ?? "Jira";
  const epic = p.links.find((l) => toolOf(l.system).id === "jira" && l.stepId === null && l.key);
  const epicKey = epic?.key ?? null;
  // The latest project.sync wins; without one, an epic that is already there means the auto-epic rule sent it.
  const synced = p.sync ? p.sync.on : epicKey !== null;
  const base = { label: "Two-way sync", projectKey: view.projectKey, siteUrl: view.siteUrl, epicKey, canLink: view.siteUrl !== null } as const;
  if (!synced) {
    const n = p.steps.filter((s) => !s.external).length;
    return {
      ...base, state: "ready", send: "Send to Jira", chip: null, waiting: false,
      hint: "Creates an epic in " + key + (n > 0 ? " and " + plural(n, "issue", "issues") : "; steps you add follow"),
    };
  }
  const mine = view.problems.find((x) => x.projectId === p.id);
  const detail = mine?.message ?? (view.tokenExpired ? "the Jira token has expired, your admin needs to enter a new one" : view.lastError ? view.lastError.slice(0, 120) : null);
  let chip: JiraRowChip;
  if (detail) chip = { tone: "problem", text: "Sync problem: " + detail };
  else if (!epicKey) chip = { tone: "sending", text: "Sending…" };
  else chip = { tone: "ok", text: "Synced · " + epicKey + (view.lastOkAt ? " · checked " + agoText(view.lastOkAt, nowMs) : "") };
  return { ...base, state: "synced", send: null, hint: "", chip, waiting: true };
}

// ── the board in numbers ──

export type BoardStats = {
  total: number;
  by: Record<StepColumn, number>;
  /** Done of all, 0-100 (0 with no steps). */
  pct: number;
  late: number;
  unowned: number;
  /** Steps that reached Done in the last 7 days. */
  doneWeek: number;
  /** Median days from Doing to Done, over the done steps that went through Doing. */
  cycleDays: number | null;
  /** The started step that has sat longest in its column (Doing or Blocked). */
  stalest: { step: Step; days: number } | null;
};

export function boardStats(p: Pick<ReducedProject, "steps">, day: number): BoardStats {
  const by: Record<StepColumn, number> = { todo: 0, doing: 0, blocked: 0, done: 0 };
  for (const s of p.steps) by[s.column]++;
  const open = p.steps.filter((s) => s.column !== "done");
  const cycles = p.steps
    .filter((s) => s.column === "done" && s.startedDay !== null && s.doneDay !== null)
    .map((s) => (s.doneDay as number) - (s.startedDay as number));
  let stalest: BoardStats["stalest"] = null;
  for (const s of open) {
    if (s.column === "todo") continue;
    const days = day - s.movedDay;
    if (!stalest || days > stalest.days) stalest = { step: s, days };
  }
  return {
    total: p.steps.length, by,
    pct: p.steps.length ? Math.round((by.done / p.steps.length) * 100) : 0,
    late: open.filter((s) => s.dueDay !== null && day > s.dueDay).length,
    unowned: open.filter((s) => !s.owner).length,
    doneWeek: p.steps.filter((s) => s.column === "done" && s.doneDay !== null && day - s.doneDay <= 7).length,
    cycleDays: median(cycles),
    stalest,
  };
}

// ── the project's life, as the stepper on its page shows it ──

export type Stage = { key: string; label: string; day: number | null; state: "done" | "now" | "next" | "stopped" };

/** Opened, baseline, started, done, measured, recognised: each with its day once reached. A stop ends the line where it happened. */
export function lifecycle(p: ReducedProject): Stage[] {
  const measured = p.measures.length ? p.measures[p.measures.length - 1].day : null;
  const raw: { key: string; label: string; day: number | null }[] = [
    { key: "opened", label: "Opened", day: p.openedDay },
    { key: "baseline", label: "Baseline", day: p.baseline?.day ?? null },
    { key: "started", label: "Started", day: p.startedDay },
    { key: "done", label: "Done", day: p.doneDay },
    { key: "measured", label: p.baseline?.none ? "Not measured" : "Measured", day: p.baseline?.none ? p.doneDay : measured },
    { key: "recognised", label: "Recognised", day: p.reward?.day ?? null },
  ];
  const firstOpen = raw.findIndex((r) => r.day === null);
  return raw.map((r, k): Stage => {
    if (r.day !== null) return { ...r, state: "done" };
    if (p.stopped && k === firstOpen) return { key: r.key, label: "Stopped", day: p.stopped.day, state: "stopped" };
    return { ...r, state: k === firstOpen && !p.stopped ? "now" : "next" };
  });
}

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

/** The tool a project.sync names, as a sentence says it. */
const syncName = (system: string | undefined): string => (system === "jira" ? "Jira" : system ?? "a tool");

/** What a project.step.edited changed, in words. */
function editedWhat(pl: CaseEvent["payload"]): string {
  const out: string[] = [];
  if (pl.text) out.push("renamed it");
  if (pl.owner !== undefined) out.push(pl.owner ? "gave it to " + pl.owner : "took the owner off");
  if (pl.dueDay !== undefined) out.push(pl.dueDay === null ? "took the due day off" : "moved the due day");
  if (pl.note !== undefined) out.push("updated the details");
  return out.join(", ") || "no change";
}

export const COLUMN_LABEL: Record<StepColumn, string> = { todo: "To do", doing: "Doing", blocked: "Blocked", done: "Done" };

export type TimelineLine = { id: string; day: number; by: string; text: string };

/** What happened to a project, oldest first, one short line per event. Comments have their own thread, so they are left out. */
export function timelineOf(p: ReducedProject): TimelineLine[] {
  // A removed step is off the board, but its text is still in the event that added it.
  const stepText = (id: unknown) => p.steps.find((s) => s.id === id)?.text
    ?? p.history.find((e) => e.type === "project.step.added" && e.payload.stepId === id)?.payload.text ?? "a step";
  const line = (ev: CaseEvent): string | null => {
    const pl = ev.payload ?? {};
    switch (ev.type) {
      case "case.decided": return "said yes, and the project opened" + (pl.lead ? " with " + pl.lead + " as lead" : "");
      case "project.member": return pl.on === false ? "took " + pl.name + " off the team" : "added " + pl.name + " to the team";
      case "project.handed": return "handed the lead to " + pl.to + (pl.why ? ": " + pl.why : "");
      case "project.baseline": return pl.none ? "said no number is possible: " + (pl.why ?? "") : "took the baseline: " + fmtNumber(pl.value ?? 0) + (pl.unit ? " " + pl.unit : "") + " " + (pl.metric ?? "") + (pl.source ? " (" + pl.source + ")" : "");
      case "project.started": return "started the project";
      case "project.step.added": return "added a step: " + (pl.text ?? "") + (pl.to && pl.to !== "todo" ? " (in " + (COLUMN_LABEL[pl.to as StepColumn] ?? pl.to) + ")" : "");
      case "project.step.edited": return pl.removed ? "removed the step “" + stepText(pl.stepId) + "”" : "changed “" + stepText(pl.stepId) + "”: " + editedWhat(pl);
      case "project.step.moved": return "moved “" + stepText(pl.stepId) + "” to " + (COLUMN_LABEL[pl.to as StepColumn] ?? pl.to) + (pl.why ? ": " + pl.why : "");
      case "project.linked": return "linked " + (pl.key || pl.url || "a page");
      case "project.sync": return pl.on === false ? "stopped syncing with " + syncName(pl.system) : "sent it to " + syncName(pl.system);
      case "project.done": return "marked it done" + (pl.note ? ": " + pl.note : "");
      case "project.measured": return "recorded the " + pl.check + "-day measure: " + fmtNumber(pl.value ?? 0) + (pl.source ? " (" + pl.source + ")" : "");
      case "project.rewarded": return "recorded the reward" + (typeof pl.amount === "number" ? ": " + eur(pl.amount) : "") + (pl.note ? " - " + pl.note : "");
      case "project.claimed": return "claimed the reward";
      case "project.stopped": return "stopped it: " + (pl.why ?? "");
      default: return null;
    }
  };
  // A move inside one column only changes the order: the timeline leaves it out.
  const col: Record<string, string> = {};
  return p.history.flatMap((ev) => {
    const pl = ev.payload ?? {};
    if (ev.type === "project.step.added" && pl.stepId) col[pl.stepId] = pl.to && pl.to !== "blocked" ? pl.to : "todo";
    if (ev.type === "project.step.moved" && pl.stepId) {
      if (col[pl.stepId] === pl.to) return [];
      col[pl.stepId] = pl.to ?? "";
    }
    const text = line(ev);
    return text ? [{ id: ev.id, day: ev.day, by: ev.actor, text }] : [];
  });
}
