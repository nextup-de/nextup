// What the project pages read off the reduced projects: who sees which, the groups of the list, the
// desk of moves, the brief's suggestions, the wait lines and the timeline. Pure: state in, plain
// facts (and the short sentences built from them) out. The shapes and rules are ./types, ./reduce,
// ./selectors and ./permissions; this file only reads them.
import type { Role } from "@/config/roles";
import { holdsRole, type Me, type SeatRow } from "@/features/auth/identity";
import type { CaseEvent } from "@/features/cases/events";
import { approverRoleIds } from "@/features/approvals/rights";
import type { ReducedCase, State } from "@/features/cases/reducer";
import { isPrivateIdea } from "@/features/cases/visibility";
import type { Initiative, InitiativeStatus } from "@/features/demo/types";
import { splitBody } from "@/features/ideas/brief";
import { DEFAULT_LOCALE, translate, type Locale, type T } from "@/i18n";
import type { MeasureImpact } from "./measure-source";
import type { LoopRules } from "@/features/loop/rules";
import { formatEuro, formatNumber } from "@/i18n/format";
import type { JiraStatusView } from "@/features/integrations/jira/types";
import type { RewardRule } from "@/features/loop/rules";
import { mayConfirm, unconfirmedOf } from "./confirm";
import { nextMove, type ProjectMove } from "./selectors";
import type { Baseline, Measure, ProjectStatus, ReducedProject, Step, StepColumn, VerdictWord } from "./types";

/** Who is looking, by id: their role and their user id; `me` (seats and roles) decides what was escalated to them. */
export type IdViewer = { role: Role; userId: string | null; me?: Me };

/** A handle, not a name: the author posted anonymously and stays that way. */
export const isHandle = (who: string) => who.startsWith("Anonymous");

/** On the draft itself (D13): its decider, lead, sponsor, followers, members and people invited who have not declined or lapsed. */
export function onDraft(p: ReducedProject, userId: string | null): boolean {
  if (userId === null) return false;
  return p.deciderUserId === userId || p.leadUserId === userId || p.sponsorUserId === userId || p.followerUserIds.includes(userId) || p.memberUserIds.includes(userId)
    || p.invites.some((i) => i.userId === userId && (i.state === "pending" || i.state === "accepted"));
}

/**
 * The viewer holds the seat a late draft went to while that escalation is live (D15, D22): that seat keeps, hands on or stops
 * the draft, so its holder reads it whatever their app role and whether or not the idea is private. By seat id, from `me`.
 */
export function escalatedToViewer(p: ReducedProject, v: IdViewer): boolean {
  const e = p.escalated;
  return e !== null && e.what === "draft" && e.live && e.toSeatId !== null && v.me?.seatIds.includes(e.toSeatId) === true;
}

/**
 * The viewer holds the role of a step of an approval run of the draft's case, a council's secretary or member role, or the role of a seat a late step
 * was handed to (plan GAT, D24). By role id from `me`, never by name. `cases` are the cases the draft came from.
 */
export function approverOfDraft(cases: readonly ReducedCase[], v: IdViewer, state: Pick<State, "seats" | "approvals">): boolean {
  const me = v.me;
  if (me === undefined) return false;
  return cases.some((c) => approverRoleIds(c, state).some((r) => me.roleIds.includes(r)));
}

/**
 * A draft is only for the people on it, the holder of the seat it was escalated to and, unless the idea is private, managers and the approvers of
 * its yes (D13, GAT D24). `privateIdea`: the raiser made the idea private. `approver`: see approverOfDraft.
 */
export function mayReadDraft(p: ReducedProject, v: IdViewer, privateIdea: boolean, approver = false): boolean {
  return onDraft(p, v.userId) || escalatedToViewer(p, v) || ((v.role === "manager" || approver) && !privateIdea);
}

/** A draft that has not started: the only kind D13 hides. A legacy project and a started one are as before. */
export const isOpenDraft = (p: ReducedProject): boolean => p.draft && p.status === "planning";

/** The projects this person may see: a member sees the projects they lead, are on, or whose idea they raised; a draft only who is on it (D13). */
export function visibleProjectsFor(state: Pick<State, "projects"> & { cases?: State["cases"]; seats?: State["seats"]; approvals?: State["approvals"] }, v: IdViewer, demo = true): ReducedProject[] {
  const all = demo ? state.projects : state.projects.filter((p) => !p.seed);
  const casesOf = (p: ReducedProject) => (state.cases ?? []).filter((c) => p.sources.includes(c.id));
  const privateIdea = (p: ReducedProject) => casesOf(p).some(isPrivateIdea);
  // The approvers of the draft's yes read it too (GAT D24); without the company's roles and seats there are none to know.
  const approver = (p: ReducedProject) => state.seats !== undefined && state.approvals !== undefined && approverOfDraft(casesOf(p), v, { seats: state.seats, approvals: state.approvals });
  const open = all.filter((p) => !isOpenDraft(p) || mayReadDraft(p, v, privateIdea(p), approver(p)));
  if (v.role !== "member") return open;
  const id = v.userId;
  if (id === null) return [];
  return open.filter((p) => p.leadUserId === id || p.memberUserIds.includes(id) || p.authorUserIds.includes(id) || onDraft(p, id) || (isOpenDraft(p) && (escalatedToViewer(p, v) || (!privateIdea(p) && approver(p)))));
}

/** The line a viewer who may not read a draft gets (D13): the lead's seat role and the start day; `roleTitle` says a role's label. */
export function beingSetUpLine(p: ReducedProject, seats: readonly SeatRow[], roleTitle: (roleId: string) => string = () => ""): { role: string; startDay: number | null } {
  const seat = p.leadUserId === null ? undefined : seats.find((s) => s.userId === p.leadUserId);
  return { role: seat ? roleTitle(seat.roleId) : "", startDay: p.startDay };
}

export type RaiserDraftPanel = { show: boolean; goal: string | null; doneWhen: string | null; brief: string | null; canComment: boolean };

/** What the raiser of the case sees of a draft they are not on (D20): its goal, done-when and brief once set, and one comment box. Nothing for anyone else. */
export function raiserDraftPanel(p: ReducedProject, viewerUserId: string | null, caseAuthorUserId: string | null): RaiserDraftPanel {
  const show = isOpenDraft(p) && viewerUserId !== null && viewerUserId === caseAuthorUserId && !onDraft(p, viewerUserId);
  if (!show) return { show: false, goal: null, doneWhen: null, brief: null, canComment: false };
  return { show, goal: p.goal?.goal ?? null, doneWhen: p.goal?.doneWhen ?? null, brief: p.goal?.brief || null, canComment: true };
}

export type ProjectGroup = { key: string; label: string; projects: ReducedProject[] };

const GROUPS: { key: "planning" | "running" | "measuring" | "measured" | "stopped"; has: readonly ProjectStatus[] }[] = [
  { key: "planning", has: ["planning"] },
  { key: "running", has: ["running"] },
  { key: "measuring", has: ["measuring"] },
  { key: "measured", has: ["measured", "recognised"] },
  { key: "stopped", has: ["stopped"] },
];

/**
 * The list's groups, in the order a project moves through them. Inside a group the most relevant first: the
 * reader's own (lead or on the team, by `userId`), then late ones, then the next move due soonest, then by
 * number. Empty groups stay (the page hides them).
 */
export function groupProjects(list: readonly ReducedProject[], locale: Locale = DEFAULT_LOCALE, userId: string | null = null): ProjectGroup[] {
  const mine = (p: ReducedProject) => userId !== null && (p.leadUserId === userId || p.memberUserIds.includes(userId));
  const due = (p: ReducedProject) => p.dueDay ?? Infinity;
  return GROUPS.map((g) => ({
    key: g.key,
    label: translate(locale, ("projects.group_" + g.key) as "projects.group_planning"),
    projects: list.filter((p) => g.has.includes(p.status))
      .sort((a, b) => Number(mine(b)) - Number(mine(a)) || Number(b.overdue) - Number(a.overdue) || due(a) - due(b) || a.number - b.number),
  }));
}

/** The lead's next move, as the button or the card says it. */
export const moveLabel = (move: NonNullable<ProjectMove>, locale: Locale = DEFAULT_LOCALE): string =>
  translate(locale, ("projects.move_" + move) as "projects.move_baseline");

export type DeskItem = {
  project: ReducedProject; move: NonNullable<ProjectMove>; why: "lead" | "escalated" | "reward" | "confirm" | "confirmUp";
  /** A result to confirm only: the last day the confirmation is on time. */
  dueDay?: number;
};

// What is most pressing first: a late move, then the moves that unblock the loop, then the board.
const MOVE_RANK: Record<NonNullable<ProjectMove>, number> = { measure: 0, start: 1, confirm: 2, baseline: 3, reward: 4, done: 5, steps: 6 };

/**
 * projectDesk by id: the lead's own moves by user id, a late move by the role of the seat it moved to. With
 * `desks` (the routes and seats), also a typed result that waits for this person as the second one (decision Q6.15).
 */
export function projectDeskFor(list: readonly ReducedProject[], day: number, v: IdViewer, desks?: Pick<State, "routes" | "seats">): DeskItem[] {
  const out: DeskItem[] = [];
  for (const p of list) {
    if (desks) {
      const deputyRoleId = desks.routes.find((r) => r.id === p.routeId)?.deputyRoleId ?? null;
      const who = { userId: v.userId, manager: v.role === "manager", me: v.me };
      const u = unconfirmedOf(p).find((x) => mayConfirm(p, x, who, deputyRoleId, desks.seats));
      if (u) {
        const up = v.role !== "manager" && !(v.me && holdsRole(v.me, deputyRoleId));
        out.push({ project: p, move: "confirm", why: up ? "confirmUp" : "confirm", dueDay: u.dueDay });
      }
    }
    const move = nextMove(p, day);
    if (!move) continue;
    if (move === "reward") {
      if (v.role === "manager") out.push({ project: p, move, why: "reward" });
    } else if (v.userId !== null && p.leadUserId === v.userId) out.push({ project: p, move, why: "lead" });
    // A stalled project is on its seat's inbox as a stalled item (features/inbox/sources/project-move.ts), so it is not listed twice.
    else if (p.escalated?.what !== "stalled" && v.me && holdsRole(v.me, p.escalated?.toRoleId ?? null)) out.push({ project: p, move, why: "escalated" });
  }
  return sortDesk(out, day);
}

const sortDesk = (out: DeskItem[], day: number): DeskItem[] => {
  // A confirmation is late by its own date, every other move by the project's.
  const late = (x: DeskItem) => (x.dueDay !== undefined ? day > x.dueDay : x.project.overdue);
  return out.sort((a, b) => Number(late(b)) - Number(late(a)) || MOVE_RANK[a.move] - MOVE_RANK[b.move] || a.project.number - b.project.number);
};

// ── AI suggests, people decide: the offline proposals, read from the source case's brief ──

const norm = (s: string) => s.toLowerCase().replace(/\s+/g, " ").trim();
const lowerFirst = (s: string) => s.charAt(0).toLowerCase() + s.slice(1);
const STEP_LINES: Record<string, (text: string, locale: Locale) => string> = {
  "first step": (t) => t,
  then: (t) => t,
  "still open": (t, locale) => translate(locale, "projects.stepClearUp", { text: lowerFirst(t) }),
};

export type StepHint = { label: string; text: string };

/** The brief's "First step", "Then" and "Still open" lines as steps - minus the ones already on the board. */
export function suggestedSteps(body: string, steps: readonly Pick<Step, "text">[], locale: Locale = DEFAULT_LOCALE): StepHint[] {
  const have = new Set(steps.map((s) => norm(s.text)));
  const out: StepHint[] = [];
  for (const f of splitBody(body).facts) {
    const make = STEP_LINES[norm(f.label)];
    if (!make) continue;
    const text = make(f.text, locale);
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
export function suggestedBaseline(body: string, kpi?: string | null, locale: Locale = DEFAULT_LOCALE): BaselineHint | null {
  const goal = splitBody(body).facts.find((f) => norm(f.label) === "goal")?.text ?? "";
  const m = /^(.*?)\s*\b(under|below|less than|fewer than|at most|over|above|more than|at least)\s+[€$]?\s*([\d.,]+)\s*(%|[^\s,.;]+)?/i.exec(goal);
  if (m) {
    const unit = (m[4] ?? "").trim();
    let metric = m[1].replace(LEADING, "").trim();
    if (metric && !metric.includes(" ") && TIME_UNITS.test(unit)) metric = translate(locale, "projects.metricTime", { metric });
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
export type Tool = { id: ToolId; short: string; sync: "sync" | "link"; host: RegExp | null };

export const TOOLS: readonly Tool[] = [
  { id: "jira", short: "JI", sync: "sync", host: /atlassian\.net$|(^|\.)jira\./i },
  { id: "azure", short: "AZ", sync: "link", host: /(^|\.)dev\.azure\.com$|visualstudio\.com$/i },
  { id: "planner", short: "PL", sync: "link", host: /planner\.cloud\.microsoft$|tasks\.office\.com$/i },
  { id: "teams", short: "TE", sync: "link", host: /teams\.microsoft\.com$|teams\.live\.com$/i },
  { id: "sharepoint", short: "SP", sync: "link", host: /sharepoint\.com$|onedrive\.live\.com$/i },
  { id: "polarion", short: "PO", sync: "link", host: /polarion/i },
  { id: "codebeamer", short: "CB", sync: "link", host: /codebeamer/i },
];

const OTHER: Tool = { id: "url", short: "↗", sync: "link", host: null };

export const toolOf = (id: string): Tool => TOOLS.find((t) => t.id === id) ?? OTHER;

// A multi-word product name is joined from its single-word parts (they read the same in every language).
type Brand = "Jira" | "Azure" | "DevOps" | "Microsoft" | "Planner" | "Teams" | "SharePoint" | "Polarion" | "codebeamer";
const BRAND_PARTS: Record<ToolId, readonly Brand[]> = {
  jira: ["Jira"], azure: ["Azure", "DevOps"], planner: ["Microsoft", "Planner"], teams: ["Microsoft", "Teams"],
  sharepoint: ["SharePoint"], polarion: ["Polarion"], codebeamer: ["codebeamer"], url: [],
};

/** The tool's name: "Jira", "Azure DevOps", ... and "Other links" for any other address. */
export const toolName = (tool: Pick<Tool, "id">, locale: Locale = DEFAULT_LOCALE): string =>
  tool.id === "url" ? translate(locale, "projects.toolOther") : BRAND_PARTS[tool.id].map((w) => translate(locale, ("projects.brand" + w) as "projects.brandJira")).join(" ");

/** One line on what a tool is for. */
export const toolWhat = (tool: Pick<Tool, "id">, locale: Locale = DEFAULT_LOCALE): string =>
  translate(locale, ("projects.toolWhat_" + tool.id) as "projects.toolWhat_jira");

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
  label: string;
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
export function agoText(iso: string, nowMs: number, locale: Locale = DEFAULT_LOCALE): string {
  const ms = nowMs - Date.parse(iso);
  if (!Number.isFinite(ms) || ms < 60_000) return translate(locale, "projects.agoNow");
  const min = Math.floor(ms / 60_000);
  if (min < 60) return translate(locale, "projects.agoMin", { count: min });
  const h = Math.floor(min / 60);
  if (h < 24) return translate(locale, "projects.agoHour", { count: h });
  return translate(locale, "projects.agoDay", { count: Math.floor(h / 24) });
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

/**
 * The Jira row for one project: pure, so it is tested without a screen. `view` is the company's
 * integration as the server built it (jiraStatusView), null where there is none (the static demo,
 * no database) - which reads as off. The row never shows more than the view holds: no secrets.
 */
export function jiraRowOf(p: Pick<ReducedProject, "sync" | "links" | "steps" | "id">, view: JiraStatusView | null, nowMs: number, locale: Locale = DEFAULT_LOCALE): JiraRow {
  const t = (key: Parameters<typeof translate>[1], params?: Record<string, string | number>) => translate(locale, key, params);
  if (!view || !view.on) {
    return {
      state: "off", label: t("projects.jiraLink"), hint: t("projects.jiraOffHint"), send: null, chip: null,
      projectKey: view?.projectKey ?? null, siteUrl: null, epicKey: null, canLink: false, waiting: false,
    };
  }
  const key = view.projectKey ?? "Jira";
  const epic = p.links.find((l) => toolOf(l.system).id === "jira" && l.stepId === null && l.key);
  const epicKey = epic?.key ?? null;
  // The latest project.sync wins; without one, an epic that is already there means the auto-epic rule sent it.
  const synced = p.sync ? p.sync.on : epicKey !== null;
  const base = { label: t("projects.jiraTwoWay"), projectKey: view.projectKey, siteUrl: view.siteUrl, epicKey, canLink: view.siteUrl !== null } as const;
  if (!synced) {
    const n = p.steps.filter((s) => !s.external).length;
    return {
      ...base, state: "ready", send: t("projects.jiraSend"), chip: null, waiting: false,
      hint: n > 0 ? t("projects.jiraReadyIssues", { key, issues: t("projects.issueCount", { count: n }) }) : t("projects.jiraReadyEmpty", { key }),
    };
  }
  const mine = view.problems.find((x) => x.projectId === p.id);
  const detail = mine?.message ?? (view.tokenExpired ? t("projects.jiraTokenExpired") : view.lastError ? view.lastError.slice(0, 120) : null);
  let chip: JiraRowChip;
  if (detail) chip = { tone: "problem", text: t("projects.jiraProblem", { detail }) };
  else if (!epicKey) chip = { tone: "sending", text: t("projects.jiraSending") };
  else chip = { tone: "ok", text: view.lastOkAt ? t("projects.jiraSyncedChecked", { epic: epicKey, ago: agoText(view.lastOkAt, nowMs, locale) }) : t("projects.jiraSynced", { epic: epicKey }) };
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
export function lifecycle(p: ReducedProject, locale: Locale = DEFAULT_LOCALE): Stage[] {
  const t = (key: Parameters<typeof translate>[1]) => translate(locale, key);
  const measured = p.measures.length ? p.measures[p.measures.length - 1].day : null;
  const raw: { key: string; label: string; day: number | null }[] = [
    { key: "opened", label: t("projects.stageOpened"), day: p.openedDay },
    { key: "baseline", label: t("projects.stageBaseline"), day: p.baseline?.day ?? null },
    { key: "started", label: t("projects.stageStarted"), day: p.startedDay },
    { key: "done", label: t("projects.stageDone"), day: p.doneDay },
    { key: "measured", label: p.baseline?.none ? t("projects.stageNotMeasured") : t("projects.stageMeasured"), day: p.baseline?.none ? p.doneDay : measured },
    { key: "recognised", label: t("projects.stageRecognised"), day: p.reward?.day ?? null },
  ];
  const firstOpen = raw.findIndex((r) => r.day === null);
  return raw.map((r, k): Stage => {
    if (r.day !== null) return { ...r, state: "done" };
    if (p.stopped && k === firstOpen) return { key: r.key, label: t("projects.stageStopped"), day: p.stopped.day, state: "stopped" };
    return { ...r, state: k === firstOpen && !p.stopped ? "now" : "next" };
  });
}

// ── numbers ──

/** 11, 2.5, 1,200 - never more than two decimals. */
export const fmtNumber = (n: number, locale: Locale = DEFAULT_LOCALE) => formatNumber(locale, Math.round(n * 100) / 100);

/** "35 → 11 days": the baseline against a measure, in the baseline's unit. */
export function movement(b: Baseline | null, m: Pick<Measure, "value">, locale: Locale = DEFAULT_LOCALE): string {
  if (!b || b.none) return fmtNumber(m.value, locale);
  return fmtNumber(b.value, locale) + " → " + fmtNumber(m.value, locale) + (b.unit ? " " + b.unit : "");
}

/** "+37.5 %" / "−68.6 %" / "" when there is no percent (a zero baseline, or none). */
export const changeText = (pct: number | null, locale: Locale = DEFAULT_LOCALE) =>
  (pct === null ? "" : (pct > 0 ? "+" : pct < 0 ? "−" : "±") + fmtNumber(Math.abs(pct), locale) + " %");

/** "higher is better" / "lower is better". */
export const betterText = (better: "up" | "down", locale: Locale = DEFAULT_LOCALE): string =>
  translate(locale, better === "up" ? "projects.betterUp" : "projects.betterDown");

/** The baseline in one line: "35 days · time to first productive day · lower is better". */
export function baselineText(b: Baseline, locale: Locale = DEFAULT_LOCALE): string {
  if (b.none) return translate(locale, "projects.baselineNone", { why: b.why });
  return fmtNumber(b.value, locale) + (b.unit ? " " + b.unit : "") + " · " + b.metric + " · " + betterText(b.better, locale);
}

/** Euros in the locale: "€2,000" / "2.000 €". */
export const euros = (n: number, locale: Locale = DEFAULT_LOCALE) => formatEuro(locale, n);

/** The company's reward rule in words. */
export function rewardRuleText(rule: RewardRule, locale: Locale = DEFAULT_LOCALE): string {
  switch (rule.kind) {
    case "none": return translate(locale, "projects.ruleNone");
    case "thanks": return translate(locale, "projects.ruleThanks");
    case "fixed": return rule.amount != null ? translate(locale, "projects.ruleFixed", { amount: euros(rule.amount, locale) }) : translate(locale, "projects.ruleFixedPlain");
    case "share": {
      const share = translate(locale, "projects.ruleShare", { pct: rule.sharePct ?? 0 });
      return rule.capEur != null ? translate(locale, "projects.ruleShareCap", { share, cap: euros(rule.capEur, locale) }) : share;
    }
  }
}

/** The verdict word of a measure, as people read it. */
export const verdictWord = (v: VerdictWord, locale: Locale = DEFAULT_LOCALE): string =>
  translate(locale, v === "not measured" ? "projects.verdictNotMeasured" : v === "better" ? "projects.verdictBetter" : v === "same" ? "projects.verdictSame" : "projects.verdictWorse");

// ── the measure card: where a result comes from, what it is worth, who confirmed it (LOOP-U1) ──

/** The people and the day format a source line needs: the labels are resolved by the caller (by user id), never matched by name. */
export type SourceNames = { by: string; confirmedBy: string; day: (d: number) => string };

/** "From kpi.csv · imported 3 Nov" / "Typed by … · not confirmed" / "Typed by … · Confirmed by … on 4 Nov". */
export function measureSourceLine(m: Measure, names: SourceNames, t: T): string {
  const date = names.day(m.day);
  if (m.sourceInfo.kind === "import") return t("projects.srcImported", { file: m.sourceInfo.file, date });
  if (m.sourceInfo.kind === "system") return t("projects.srcSystem", { system: m.sourceInfo.system, date });
  if (!m.confirmed) return t("projects.srcTypedUnconfirmed", { role: names.by });
  return t("projects.srcTypedConfirmed", { role: names.by, confirmer: names.confirmedBy, date: names.day(m.confirmedDay ?? m.day) });
}

/** One line per impact figure that was given, with its unit. */
export function impactLines(impact: MeasureImpact | null | undefined, locale: Locale = DEFAULT_LOCALE): string[] {
  if (!impact) return [];
  const out: string[] = [];
  const add = (v: number | undefined, key: "projects.impactSaving" | "projects.impactCo2" | "projects.impactEnergy" | "projects.impactScrap") => {
    if (v !== undefined) out.push(translate(locale, key, { value: fmtNumber(v, locale) }));
  };
  add(impact.savingEurPerYear, "projects.impactSaving");
  add(impact.co2KgPerYear, "projects.impactCo2");
  add(impact.energyKwhPerYear, "projects.impactEnergy");
  add(impact.scrapPartsPerYear, "projects.impactScrap");
  return out;
}

/** The project's verdict as the card says it: "Not confirmed yet" while the latest result is not confirmed. */
export function verdictLabel(p: Pick<ReducedProject, "measures" | "verdict">, locale: Locale = DEFAULT_LOCALE): string | null {
  const latest = p.measures[p.measures.length - 1];
  if (latest && !latest.confirmed && latest.sourceKind !== "system") return translate(locale, "projects.verdictNotConfirmed");
  return p.verdict ? verdictWord(p.verdict, locale) : null;
}

/** The company's steps decide which panels the page shows. */
export const measureShown = (rules: Pick<LoopRules, "measure">): boolean => rules.measure;
export const rewardShown = (rules: Pick<LoopRules, "recognition">): boolean => rules.recognition;

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
export function asInitiatives(list: readonly ReducedProject[], deptOf: (name: string) => string | null, deptName: (id: string) => string, whyOf: (p: ReducedProject) => string, locale: Locale = DEFAULT_LOCALE): Initiative[] {
  const t = (key: Parameters<typeof translate>[1], params?: Record<string, string | number>) => translate(locale, key, params);
  const out: Initiative[] = [];
  for (const p of list) {
    const status = COLLAB_STATUS[p.status];
    if (!status) continue;
    const team = [p.lead, ...p.members];
    const depts = [...new Set(team.map(deptOf).filter((d): d is string => !!d))];
    const blocked = p.steps.find((s) => s.column === "blocked");
    const done = p.steps.filter((s) => s.column === "done").length;
    const stage = p.status === "planning" ? (p.overdue ? t("projects.stagePlanningLate") : t("projects.stagePlanning"))
      : p.status === "running" ? t("projects.stepsDoneOf", { done, total: p.steps.length })
      : p.status === "measuring" ? t("projects.stageDoneMeasuring")
      : p.verdict ? t("projects.stageMeasuredVerdict", { verdict: verdictWord(p.verdict, locale) }) : t("projects.stageMeasuredPlain");
    out.push({
      id: p.id, name: p.title, depts, people: team.length, status, stage, why: whyOf(p),
      members: team.map((name, k) => {
        const dept = deptOf(name) ? deptName(deptOf(name) as string) : t("projects.roleTeam");
        return { name, role: k === 0 ? t("projects.roleLead", { dept }) : dept };
      }),
      stuckOn: p.escalated ? { name: p.escalated.to, reason: p.escalated.what === "start" ? t("projects.stuckStart") : t("projects.stuckMeasure") }
        : blocked ? { name: blocked.owner ?? p.lead, reason: t("projects.stuckBlocked", { why: blocked.why || t("projects.stuckNoReason") }) } : undefined,
    });
  }
  return out;
}

// ── the timeline ──

/** The tool a project.sync names, as a sentence says it. */
const syncName = (system: string | undefined, locale: Locale): string =>
  system === "jira" ? toolName({ id: "jira" }, locale) : system ?? translate(locale, "projects.aTool");

/** What a project.step.edited changed, in words. */
function editedWhat(pl: CaseEvent["payload"], locale: Locale): string {
  const t = (key: Parameters<typeof translate>[1], params?: Record<string, string | number>) => translate(locale, key, params);
  const out: string[] = [];
  if (pl.text) out.push(t("projects.editRenamed"));
  if (pl.owner !== undefined) out.push(pl.owner ? t("projects.editGave", { owner: pl.owner }) : t("projects.editOwnerOff"));
  if (pl.dueDay !== undefined) out.push(pl.dueDay === null ? t("projects.editDueOff") : t("projects.editDueMoved"));
  if (pl.note !== undefined) out.push(t("projects.editDetails"));
  return out.join(", ") || t("projects.editNone");
}

/** A step column's name. */
export const columnLabel = (col: StepColumn | string, locale: Locale = DEFAULT_LOCALE): string =>
  col === "todo" || col === "doing" || col === "blocked" || col === "done" ? translate(locale, ("projects.col_" + col) as "projects.col_todo") : col;

export type TimelineLine = { id: string; day: number; by: string; text: string };

/** What happened to a project, oldest first, one short line per event. Comments have their own thread, so they are left out. */
export function timelineOf(p: ReducedProject, locale: Locale = DEFAULT_LOCALE): TimelineLine[] {
  const t = (key: Parameters<typeof translate>[1], params?: Record<string, string | number>) => translate(locale, key, params);
  // A removed step is off the board, but its text is still in the event that added it.
  const stepText = (id: unknown) => p.steps.find((s) => s.id === id)?.text
    ?? p.history.find((e) => e.type === "project.step.added" && e.payload.stepId === id)?.payload.text ?? t("projects.aStep");
  const line = (ev: CaseEvent): string | null => {
    const pl = ev.payload ?? {};
    switch (ev.type) {
      case "case.decided": return pl.lead ? t("projects.tlDecidedLead", { lead: pl.lead }) : t("projects.tlDecided");
      case "project.member": return pl.on === false ? t("projects.tlMemberOff", { name: pl.name ?? "" }) : t("projects.tlMemberOn", { name: pl.name ?? "" });
      case "project.handed": return pl.why ? t("projects.tlHandedWhy", { to: pl.to ?? "", why: pl.why }) : t("projects.tlHanded", { to: pl.to ?? "" });
      case "project.baseline":
        if (pl.none) return t("projects.tlBaselineNone", { why: pl.why ?? "" });
        return t("projects.tlBaseline", { number: fmtNumber(pl.value ?? 0, locale) + (pl.unit ? " " + pl.unit : "") + " " + (pl.metric ?? "") + (pl.source ? " (" + pl.source + ")" : "") });
      case "project.started": return t("projects.tlStarted");
      case "project.step.added": return t("projects.tlStepAdded", { text: (pl.text ?? "") + (pl.to && pl.to !== "todo" ? " " + t("projects.tlStepAddedIn", { column: columnLabel(pl.to, locale) }) : "") });
      case "project.step.edited": return pl.removed ? t("projects.tlStepRemoved", { step: stepText(pl.stepId) as string }) : t("projects.tlStepChanged", { step: stepText(pl.stepId) as string, what: editedWhat(pl, locale) });
      case "project.step.moved": return pl.why ? t("projects.tlStepMovedWhy", { step: stepText(pl.stepId) as string, column: columnLabel(pl.to ?? "", locale), why: pl.why }) : t("projects.tlStepMoved", { step: stepText(pl.stepId) as string, column: columnLabel(pl.to ?? "", locale) });
      case "project.linked": return t("projects.tlLinked", { what: pl.key || pl.url || t("projects.aPage") });
      case "project.sync": return pl.on === false ? t("projects.tlSyncOff", { tool: syncName(pl.system, locale) }) : t("projects.tlSyncOn", { tool: syncName(pl.system, locale) });
      case "project.done": return pl.note ? t("projects.tlDoneNote", { note: pl.note }) : t("projects.tlDone");
      case "project.measured": return t("projects.tlMeasured", { check: pl.check ?? "", value: fmtNumber(pl.value ?? 0, locale) + (pl.source ? " (" + pl.source + ")" : "") });
      case "project.rewarded": {
        const base = typeof pl.amount === "number" ? t("projects.tlRewardedAmount", { amount: euros(pl.amount, locale) }) : t("projects.tlRewarded");
        return pl.note ? base + " - " + pl.note : base;
      }
      case "project.claimed": return t("projects.tlClaimed");
      case "project.stopped": return t("projects.tlStopped", { why: pl.why ?? "" });
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
