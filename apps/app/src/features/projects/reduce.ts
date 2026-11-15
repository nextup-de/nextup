// The project half of reduce(seed, log) (features/cases/reducer.ts calls into this). A project
// opens with the case.decided yes that names it, and changes only through project.* events.
// Pure like the case reducer: state in, state out, nothing stored.
import type { SeatRow } from "@/features/auth/identity";
import type { CaseEvent, CaseEventType, EventPayload } from "@/features/cases/events";
import { DONE_BY_DEFAULT_DAYS } from "@/features/clock/kinds/project";
import type { Route } from "@/features/demo/types";
import type { LoopRules } from "@/features/loop/rules";
import { templateSteps } from "@/features/templates/library";
import type { CheckDue, Invite, InviteRole, Milestone, MilestoneExternal, MilestoneSync, ProjectPage, ReducedProject, Request, SeedProject, Step, StepColumn, ToolInstance } from "./types";
import { STEP_COLUMNS, SYNC_SYSTEMS } from "./types";
import { readImpact, readSource, sourceLabel } from "./measure-source";
import { DEFAULT_PAGES, LIMITS, mergePlan, TOOL_KINDS } from "./pages";
import { revisionMatches } from "./result";
import { verdictOf } from "./verdict";

/**
 * What a draft needs beyond its public fields, derived from the log as it replays (never from today's day): the event
 * that asked the lead, the day the lead took it, a start day the seat above moved it to, and where in the project's
 * history the lead last changed (an escalation or a moved day before that no longer counts). Kept beside the project,
 * so the reduced shape has no field for it.
 */
type DraftFacts = { askId: string | null; takenDay: number | null; movedStart: number | null; movedAt: number; reassignedAt: number };
const draftFacts = new WeakMap<ReducedProject, DraftFacts>();
const factsOf = (p: ReducedProject): DraftFacts => {
  let f = draftFacts.get(p);
  if (!f) draftFacts.set(p, (f = { askId: null, takenDay: null, movedStart: null, movedAt: -1, reassignedAt: -1 }));
  return f;
};
/** Template steps nobody moved, edited or linked: the ones a changed template may swap (Q5.5). */
const touchedSteps = new WeakSet<Step>();
/** The paragraphs approvers added to the brief as conditions (plan GAT, D22), in the order given; joined to the goal's brief when the project is finished. */
const conditionsOf = new WeakMap<ReducedProject, string[]>();

/** A new draft waits for the last approval (plan GAT, D21): no start day, no draft escalation and no start until it is answered. A project the run did not open is left alone. */
export function setWaitingForApproval(p: ReducedProject, waiting: boolean): void {
  p.waitsForApproval = waiting;
}

/** The run's last yes decided the case on day `d`: the draft no longer waits, and its start day counts from the later of the lead taking it and this day (SET D14). */
export function approvalGiven(p: ReducedProject, d: number): void {
  p.waitsForApproval = false;
  p.approvalsPendingSince = Math.max(p.approvalsPendingSince ?? d, d);
}

/** An approver said yes with conditions: one more paragraph of the project's brief (D22). */
export function addCondition(p: ReducedProject, text: string): void {
  const list = conditionsOf.get(p) ?? [];
  list.push(text);
  conditionsOf.set(p, list);
}

export type ProjectBook = { byId: Record<string, ReducedProject>; order: string[] };

export const newBook = (): ProjectBook => ({ byId: {}, order: [] });

function fresh(book: ProjectBook, id: string, p: Pick<ReducedProject, "title" | "sources" | "authors" | "routeId" | "lead" | "members" | "leadUserId" | "memberUserIds" | "authorUserIds" | "openedDay" | "openedBy" | "seed">): ReducedProject {
  const project: ReducedProject = {
    id, number: 0, ...p,
    startedDay: null, doneDay: null, doneNote: "", stopped: null, baseline: null,
    steps: [], links: [], sync: null, measures: [], checks: [], verdict: null, reward: null, claimed: null,
    status: "planning", closed: false, rewardDue: false, dueDay: null, overdue: false, escalated: null, history: [],
    draft: false, leadState: "taken", leadAskedDay: null, template: null, invites: [], sponsorUserId: null, followerUserIds: [],
    goal: null, startDay: null, approvalsPendingSince: null, raiserNote: "", deciderUserId: null,
    doneBy: null, doneByMoves: [], pausedUntil: null, pauseWhy: "", lastActivityDay: null, checkInWeekday: null, howWeWorkNote: "", leadVacatedDay: null, latestUpdate: null,
    rewardDueDay: null, helpAsks: [], pages: null, milestones: [], forms: [], requests: [], removed: [], merges: {},
  };
  book.byId[id] = project;
  book.order.push(id);
  return project;
}

/** A project from the company's seed (demo data); its history arrives as seed events. */
export function seedProject(book: ProjectBook, row: SeedProject): void {
  if (book.byId[row.id]) return;
  fresh(book, row.id, {
    title: row.title, sources: row.sources.slice(), authors: row.authors.slice(), routeId: row.routeId ?? null,
    lead: row.lead, members: (row.members ?? []).filter((m) => m !== row.lead),
    leadUserId: row.leadUserId ?? null,
    memberUserIds: (row.memberUserIds ?? []).filter((u) => u !== (row.leadUserId ?? null)),
    authorUserIds: (row.authorUserIds ?? []).slice(),
    openedDay: row.openedDay, openedBy: row.openedBy, seed: true,
  });
}

/** The case a yes came from, as the project needs it. */
export type Source = { id: string; from: string; fromUserId?: string | null; routeId: string | null; title: string };

/**
 * case.decided { answer: "yes", projectId, lead, title }: open that project, or - when it is
 * already open - add this idea to it. Returns the project, or null when nothing changed.
 */
export function openOrJoin(book: ProjectBook, ev: CaseEvent, source: Source): ReducedProject | null {
  const pl = ev.payload;
  const id = pl.projectId;
  if (!id) return null;
  const have = book.byId[id];
  if (have) {
    if (have.stopped || have.reward || have.sources.includes(source.id)) return null;
    have.sources.push(source.id);
    if (!have.authors.includes(source.from)) have.authors.push(source.from);
    if (source.fromUserId && !have.authorUserIds.includes(source.fromUserId)) have.authorUserIds.push(source.fromUserId);
    have.history.push(ev);
    return have;
  }
  const lead = pl.lead?.trim() || ev.actor;
  const p = fresh(book, id, {
    title: pl.title?.trim() || source.title, sources: [source.id], authors: [source.from], routeId: source.routeId,
    lead, members: [], leadUserId: pl.leadUserId ?? ev.actorUserId ?? null, memberUserIds: [],
    authorUserIds: source.fromUserId ? [source.fromUserId] : [], openedDay: ev.day | 0, openedBy: ev.actor, seed: Boolean(ev.seed),
  });
  if (pl.draft === true) {
    // A draft (D8, D10, D11): the decider asks the lead to take it, unless they lead it themselves.
    const f = factsOf(p);
    p.draft = true;
    p.raiserNote = pl.raiserNote?.trim() ?? "";
    p.deciderUserId = ev.actorUserId ?? null;
    f.askId = ev.id;
    if (p.leadUserId !== null && p.leadUserId !== (ev.actorUserId ?? null)) {
      p.leadState = "pending";
      p.leadAskedDay = ev.day | 0;
    } else {
      f.takenDay = ev.day | 0;
    }
  }
  p.history.push(ev);
  return p;
}

const isColumn = (s: unknown): s is StepColumn => typeof s === "string" && (STEP_COLUMNS as readonly string[]).includes(s);

/** Put a step right above `before` (when that is another step), else after every other step. */
function placeStep(p: ReducedProject, stepId: string, before: string | null): void {
  const k = p.steps.findIndex((x) => x.id === stepId);
  if (k < 0) return;
  const [s] = p.steps.splice(k, 1);
  const at = before && before !== stepId ? p.steps.findIndex((x) => x.id === before) : -1;
  if (at < 0) p.steps.push(s);
  else p.steps.splice(at, 0, s);
}

/** Insert at the remembered next sibling, or append when that sibling no longer exists. */
function insertBefore<T extends { id: string }>(items: T[], item: T, before: string | null | undefined): void {
  const at = items.findIndex((x) => x.id === before);
  items.splice(at < 0 ? items.length : at, 0, item);
}

/** Page facts replay independently of visibility; even the Agent tools belong to the stored model. */
function applyPageEvent(p: ReducedProject, ev: CaseEvent): void {
  const pages = p.pages ??= DEFAULT_PAGES.map((page) => ({ ...page, tools: page.tools.map((tool) => ({ ...tool })) }));
  const pl = ev.payload;
  const day = ev.day | 0;
  p.removed = p.removed.filter((item) => day - item.day <= LIMITS.removedDays);
  const page = pages.find((x) => x.id === pl.pageId);
  const toolPage = pages.find((x) => x.tools.some((tool) => tool.id === pl.toolId));
  const tool = toolPage?.tools.find((x) => x.id === pl.toolId);
  switch (ev.type) {
    case "project.page.added": {
      if (!pl.pageId || page || !pl.title || !pl.icon || !pl.tools) break;
      const tools: ToolInstance[] = pl.tools.map((x) => ({ id: x.toolId, kind: x.kind, title: x.title ?? null, content: x.content ?? null, collapsed: false, rev: 0 }));
      insertBefore(pages, { id: pl.pageId, title: pl.title, icon: pl.icon, tools }, pl.before);
      break;
    }
    case "project.page.edited":
      if (page) {
        if (pl.title !== undefined) page.title = pl.title;
        if (pl.icon !== undefined) page.icon = pl.icon;
      }
      break;
    case "project.page.moved":
      if (page && pl.before !== page.id) {
        pages.splice(pages.indexOf(page), 1);
        insertBefore(pages, page, pl.before);
      }
      break;
    case "project.page.removed":
      if (page && page.id !== "overview" && pages.length > 1) {
        const at = pages.indexOf(page);
        p.removed.push({ page, tool: null, pageId: page.id, before: pages[at + 1]?.id ?? null, day });
        pages.splice(at, 1);
      }
      break;
    case "project.page.restored": {
      const at = p.removed.findIndex((x) => x.page?.id === pl.pageId);
      const item = p.removed[at];
      if (item?.page && !page) {
        insertBefore(pages, item.page, item.before);
        p.removed.splice(at, 1);
      }
      break;
    }
    case "project.tool.added":
      if (page && pl.toolId && pl.kind && TOOL_KINDS.includes(pl.kind as ToolInstance["kind"]) && !tool) {
        insertBefore(page.tools, { id: pl.toolId, kind: pl.kind as ToolInstance["kind"], title: null, collapsed: false, content: null, rev: 0 }, pl.before);
      }
      break;
    case "project.tool.moved": {
      const into = pages.find((x) => x.id === pl.toPageId);
      if (into && tool && toolPage && pl.before !== tool.id) {
        toolPage.tools.splice(toolPage.tools.indexOf(tool), 1);
        insertBefore(into.tools, tool, pl.before);
      }
      break;
    }
    case "project.tool.edited":
      if (tool) {
        if (pl.title !== undefined) tool.title = pl.title;
        if (pl.collapsed !== undefined) tool.collapsed = pl.collapsed;
        if (pl.content !== undefined) { tool.content = pl.content; tool.rev += 1; }
      }
      break;
    case "project.tool.removed":
      if (tool && toolPage) {
        const at = toolPage.tools.indexOf(tool);
        p.removed.push({ page: null, tool, pageId: toolPage.id, before: toolPage.tools[at + 1]?.id ?? null, day });
        toolPage.tools.splice(at, 1);
      }
      break;
    case "project.tool.restored": {
      const at = p.removed.findIndex((x) => x.tool?.id === pl.toolId);
      const item = p.removed[at];
      const into = pages.find((x) => x.id === item?.pageId);
      if (into && item?.tool && !tool) {
        insertBefore(into.tools, item.tool, item.before);
        p.removed.splice(at, 1);
      }
      break;
    }
    case "project.page.merged": {
      const sourcePage = pages.find((x) => x.id === pl.fromPageId);
      const destinationPage = pages.find((x) => x.id === pl.intoPageId);
      if (!sourcePage || !destinationPage || sourcePage === destinationPage || !pl.mergeId || Object.hasOwn(p.merges, pl.mergeId)) break;
      const plan = mergePlan(destinationPage, sourcePage);
      if (plan.refused) break;
      const at = pages.indexOf(sourcePage);
      p.merges[pl.mergeId] = { from: { id: sourcePage.id, title: sourcePage.title, icon: sourcePage.icon, before: pages[at + 1]?.id ?? null }, toolIds: sourcePage.tools.map((x) => x.id) };
      destinationPage.tools.push(...plan.moved);
      pages.splice(at, 1);
      break;
    }
    case "project.page.unmerged": {
      const mergeId = pl.mergeId;
      if (!mergeId || !Object.hasOwn(p.merges, mergeId)) break;
      const { from: originalPage, toolIds } = p.merges[mergeId];
      if (pages.some((x) => x.id === originalPage.id)) break;
      const tools: ToolInstance[] = [];
      for (const id of toolIds) {
        const holder = pages.find((x) => x.tools.some((t) => t.id === id));
        const at = holder?.tools.findIndex((x) => x.id === id) ?? -1;
        if (holder && at >= 0) tools.push(...holder.tools.splice(at, 1));
      }
      const restored: ProjectPage = { id: originalPage.id, title: originalPage.title, icon: originalPage.icon, tools };
      insertBefore(pages, restored, originalPage.before);
      delete p.merges[mergeId];
      break;
    }
  }
}

/** Frees the open steps of a user who left the team or the company: they have no owner now (MOV D22). Done steps keep theirs. */
function freeSteps(p: ReducedProject, userId: string): void {
  p.steps.forEach((x) => { if (x.column !== "done" && x.ownerUserId === userId) { x.owner = null; x.ownerUserId = null; } });
}

/** The step a project.step.added (or a stepped request) puts on the board: any column but Blocked, which needs its reason, so it is a move. */
function newStep(ev: CaseEvent, d: number, a: { stepId: string; text: string; owner?: string; ownerUserId?: string | null; dueDay?: number | null; note?: string; to?: unknown; external?: EventPayload["external"] }): Step {
  const column: StepColumn = isColumn(a.to) && a.to !== "blocked" ? a.to : "todo";
  return {
    checklist: [], comments: [], waitingOn: null,
    id: a.stepId, text: a.text, owner: a.owner?.trim() || null, ownerUserId: a.ownerUserId ?? null, dueDay: typeof a.dueDay === "number" ? a.dueDay : null,
    column, why: "", note: a.note?.trim() ?? "", addedDay: d, by: ev.actor, byUserId: ev.actorUserId ?? null, movedDay: d,
    startedDay: column === "todo" ? null : d, doneDay: column === "done" ? d : null,
    external: a.external?.system && a.external.key ? { system: a.external.system, key: a.external.key, url: a.external.url } : null, dropped: null,
  };
}

/** The events that touch a step after it was made: a move, an edit, a comment, a checklist change, a link, a call for help. */
const STEP_TOUCH: ReadonlySet<CaseEventType> = new Set<CaseEventType>(["project.step.moved", "project.step.edited", "project.step.commented", "project.step.checklist", "project.linked", "project.help.asked"]);

/**
 * The step a stepped request made, while nobody has touched it since (REQ D4): still in the column it started in, never edited, moved,
 * commented or linked, and without a Jira key. Null when the request has no step or the step is no longer untouched.
 */
export function untouchedStepOf(p: ReducedProject, request: Request): Step | null {
  const step = request.stepId === null ? undefined : p.steps.find((x) => x.id === request.stepId);
  if (!step || step.external !== null || step.dropped || step.comments.length > 0 || step.checklist.length > 0) return null;
  const at = p.history.findLastIndex((e) => e.type === "project.request.stepped" && e.payload.requestId === request.id);
  if (at < 0) return null;
  const made = p.history[at].payload.step;
  if (typeof made !== "object" || made.column !== step.column) return null;
  return p.history.slice(at + 1).some((e) => STEP_TOUCH.has(e.type) && e.payload.stepId === step.id) ? null : step;
}

/** The events that count as the project moving (MOV D12): the quiet and stalled clocks start over after each of them. */
const ACTIVITY_TYPES: ReadonlySet<CaseEventType> = new Set<CaseEventType>([
  "project.step.added", "project.step.moved", "project.step.edited", "project.update", "project.resumed", "project.handed", "project.lead.changed",
]);
/** What ends a standing stalled escalation: activity, a new done-by date, a pause (MOV D12; a new lead is an activity above). Done and stop end the running status itself. */
const STALLED_ENDERS: ReadonlySet<CaseEventType> = new Set<CaseEventType>([...ACTIVITY_TYPES, "project.doneby.moved", "project.paused"]);

/**
 * The working day the latest pause ends or ended, read off the history alone (never off today): its untilDay, or the day a
 * project.resumed ended it early. For a pause still running that is its untilDay, and the caller compares it with today. Null when
 * the project was never paused. Quiet counts from the day after this one (MOV D20). A later pause does not hide an earlier one's end:
 * each pause is closed by the next resume, the next pause or its own untilDay.
 */
export function pauseEndedDay(history: readonly CaseEvent[]): number | null {
  let until: number | null = null;
  let ended: number | null = null;
  for (const e of history) {
    if (e.type === "project.paused" && typeof e.payload.untilDay === "number") {
      // A pause that is still open when the next one starts ran to its own untilDay.
      if (until !== null) ended = Math.min(until, e.day | 0);
      until = e.payload.untilDay;
    } else if (e.type === "project.resumed" && until !== null) {
      ended = Math.min(until, e.day | 0);
      until = null;
    }
  }
  return until !== null ? until : ended;
}

const INVITE_ROLES: readonly InviteRole[] = ["sponsor", "member", "contributor", "follower"];

/** The lead takes the draft on day `d`: its start window opens, and template steps without a day get theirs. */
function takeLead(p: ReducedProject, f: DraftFacts, d: number): void {
  p.leadState = "taken";
  f.takenDay = d;
  const t = p.template;
  if (!t) return;
  const steps = templateSteps(t.key, t.version);
  p.steps.forEach((x) => {
    const at = x.id.startsWith(`t:${t.key}:${t.version}:`) ? Number(x.id.slice(`t:${t.key}:${t.version}:`.length)) : -1;
    if (at >= 0 && at < steps.length && x.dueDay === null && !touchedSteps.has(x)) x.dueDay = d + steps[at].day;
  });
}

/** The Jira link of a milestone event, or null when it is not a well-formed one (plan JSY D9). */
function milestoneExternal(v: unknown): MilestoneExternal | null {
  if (typeof v !== "object" || v === null) return null;
  const x = v as Record<string, unknown>;
  const ok = x.system === "jira" && typeof x.key === "string" && x.key.length > 0 && x.key.length <= 100
    && typeof x.url === "string" && x.url.length <= 1000 && /^https?:\/\/[^\s]+$/i.test(x.url) && (x.mode === "owned" || x.mode === "imported");
  return ok ? { system: "jira", key: x.key as string, url: x.url as string, mode: x.mode as "owned" | "imported" } : null;
}

const SYNC_OPS: readonly string[] = ["create", "update", "archive", "fixVersion"];
/** A pending or failed write to Jira of a milestone event, or null (plan JSY D22). */
function milestoneSync(v: unknown): MilestoneSync | null {
  if (typeof v !== "object" || v === null) return null;
  const x = v as Record<string, unknown>;
  if ((x.state !== "pending" && x.state !== "failed") || typeof x.op !== "string" || !SYNC_OPS.includes(x.op)) return null;
  const why = typeof x.why === "string" && x.why.trim() ? x.why.trim().slice(0, 300) : undefined;
  return { state: x.state, op: x.op as MilestoneSync["op"], ...(why ? { why } : {}) };
}

/** One project.* event. Returns false when the event is not a project event at all. */
export function applyProjectEvent(book: ProjectBook, ev: CaseEvent, rules: LoopRules): boolean {
  const isFact = ev.type === "clock.due"; // a stored due fact (CLK/D10) on a project; on a case the case reducer takes it
  if (!isFact && !ev.type.startsWith("project.")) return false;
  const p = ev.target ? book.byId[ev.target] : undefined;
  if (!p) return !isFact;
  const pl = ev.payload ?? {};
  const d = ev.day | 0;
  const live = p.stopped === null;
  /** Only the Jira sync may link a milestone to a version or mark a write pending (plan JSY D9). */
  const bySync = ev.actor.startsWith("system:");
  if (ev.type.startsWith("project.page.") || ev.type.startsWith("project.tool.")) {
    applyPageEvent(p, ev);
    p.history.push(ev);
    return true;
  }
  switch (ev.type) {
    case "project.member": {
      const userId = pl.userId;
      if (!userId || userId === p.leadUserId) break;
      const name = pl.name?.trim() ?? "";
      if (pl.on === false) {
        p.memberUserIds = p.memberUserIds.filter((u) => u !== userId);
        if (name) p.members = p.members.filter((m) => m !== name); // the shown list only
        if (pl.unassign === true) {
          // A leaver (MOV D22): no owner on their open steps, and no longer sponsor or follower. Without it, nothing of this happens.
          freeSteps(p, userId);
          if (p.sponsorUserId === userId) p.sponsorUserId = null;
          p.followerUserIds = p.followerUserIds.filter((u) => u !== userId);
        }
      } else if (!p.memberUserIds.includes(userId)) {
        p.memberUserIds.push(userId);
        if (name) p.members.push(name);
      }
      break;
    }
    case "project.handed": {
      const toUserId = pl.toUserId ?? null;
      const to = pl.to?.trim() ?? "";
      if (!live || toUserId === null || toUserId === p.leadUserId) break;
      const draftAsk = p.draft && p.startedDay === null;
      // The old lead joins the team (by id; the label list only follows for display). A draft lead who never took it does not.
      if (p.leadUserId !== null && !(draftAsk && p.leadState === "pending") && !p.memberUserIds.includes(p.leadUserId)) {
        p.memberUserIds.push(p.leadUserId);
        if (p.lead) p.members.push(p.lead);
      }
      p.memberUserIds = p.memberUserIds.filter((u) => u !== toUserId);
      if (to) p.members = p.members.filter((m) => m !== to);
      p.leadUserId = toUserId;
      if (to) p.lead = to;
      if (draftAsk) {
        // The new lead is asked again, unless the one handing it over is the new lead (D11); a new window starts.
        const f = factsOf(p);
        f.askId = ev.id;
        f.movedStart = null;
        f.reassignedAt = p.history.length;
        if (toUserId === (ev.actorUserId ?? null)) takeLead(p, f, d);
        else { p.leadState = "pending"; p.leadAskedDay = d; f.takenDay = null; }
      }
      break;
    }
    case "project.lead.answered": {
      const f = factsOf(p);
      if (!p.draft || p.startedDay !== null || !live || p.leadState !== "pending") break;
      if (pl.askId !== undefined && pl.askId !== f.askId) break; // an answer to an earlier ask
      if (pl.take === true) takeLead(p, f, d);
      else {
        // Declined, or nobody answered: it goes back to the decider, who leads it from this day (D11).
        p.leadUserId = p.deciderUserId;
        p.lead = p.openedBy;
        p.memberUserIds = p.memberUserIds.filter((u) => u !== p.leadUserId);
        f.movedStart = null;
        f.reassignedAt = p.history.length;
        takeLead(p, f, d);
      }
      break;
    }
    case "project.template": {
      if (!p.draft || p.startedDay !== null || !live) break;
      const key = typeof pl.key === "string" ? pl.key : "";
      const version = typeof pl.version === "number" ? pl.version : 0;
      const steps = templateSteps(key, version);
      if (steps.length === 0) break;
      const f = factsOf(p);
      // Steps of the old template nobody touched go; touched ones stay (Q5.5).
      const old = p.template;
      if (old) p.steps = p.steps.filter((x) => !x.id.startsWith(`t:${old.key}:${old.version}:`) || touchedSteps.has(x));
      steps.forEach((t, i) => {
        const id = `t:${key}:${version}:${i}`;
        if (p.steps.some((x) => x.id === id)) return;
        p.steps.push({
          checklist: [], comments: [], waitingOn: null,
          id, text: t.text, owner: null, ownerUserId: null, dueDay: f.takenDay === null ? null : f.takenDay + t.day, column: "todo", why: "", note: "",
          addedDay: d, by: ev.actor, byUserId: ev.actorUserId ?? null, movedDay: d, startedDay: null, doneDay: null, external: null, role: t.role, dropped: null,
        });
      });
      p.template = { key, version };
      const title = pl.title?.trim();
      if (title) p.title = title;
      break;
    }
    case "project.invited": {
      if (!p.draft || !live || p.reward !== null) break;
      const userId = pl.userId;
      const role = INVITE_ROLES.find((r) => r === pl.role);
      if (!userId || !role) break;
      if (role === "follower") {
        if (!p.followerUserIds.includes(userId)) p.followerUserIds.push(userId);
        break;
      }
      // An open invitation stays; a declined or lapsed one is replaced by a new one (a new generation, its own id).
      const same = p.invites.find((i) => i.userId === userId && i.role === role && i.state !== "declined" && i.state !== "lapsed");
      if (same) break;
      p.invites = p.invites.filter((i) => !(i.userId === userId && i.role === role));
      p.invites.push({ id: ev.id, userId, role, state: "pending", day: d, reason: "" });
      break;
    }
    case "project.invite.answered": {
      if (!p.draft || !live || p.reward !== null) break;
      const userId = pl.userId;
      // The answer names its invitation. One without (a legacy write) counts only when the person has exactly one pending.
      const pending = p.invites.filter((i) => i.userId === userId && i.state === "pending");
      const invite: Invite | undefined = pl.inviteId !== undefined ? pending.find((i) => i.id === pl.inviteId) : pending.length === 1 ? pending[0] : undefined;
      if (!invite) break;
      invite.reason = pl.reason?.trim() ?? "";
      if (pl.take === true) {
        invite.state = "accepted";
        if (invite.role === "sponsor") p.sponsorUserId = invite.userId;
        else if ((invite.role === "member" || invite.role === "contributor") && invite.userId !== p.leadUserId && !p.memberUserIds.includes(invite.userId)) p.memberUserIds.push(invite.userId);
      } else invite.state = pl.lapsed === true ? "lapsed" : "declined";
      break;
    }
    case "project.goal": {
      if (!p.draft || p.startedDay !== null || !live) break;
      const goal = pl.goal?.trim();
      const doneWhen = pl.doneWhen?.trim();
      if (!goal || !doneWhen) break;
      p.goal = { goal, doneWhen, doneBy: typeof pl.doneBy === "number" ? pl.doneBy : null, brief: pl.brief?.trim() ?? "" };
      break;
    }
    case "project.start.moved": {
      const f = factsOf(p);
      if (!p.draft || p.startedDay !== null || !live || p.leadState !== "taken" || typeof pl.dueDay !== "number") break;
      f.movedStart = pl.dueDay;
      f.movedAt = p.history.length;
      p.startDay = pl.dueDay;
      break;
    }
    case "project.baseline": {
      if (p.startedDay !== null || !live) break; // taken before the start, never after
      if (pl.none) p.baseline = { none: true, why: pl.why ?? "", day: d, by: ev.actor, byUserId: ev.actorUserId ?? null, eventId: ev.id, confirmed: null };
      else if (typeof pl.value === "number" && Number.isFinite(pl.value) && pl.metric)
        p.baseline = { none: false, metric: pl.metric, unit: pl.unit ?? "", value: pl.value, better: pl.better === "up" ? "up" : "down", source: typeof pl.source === "string" ? pl.source : "", day: d, by: ev.actor, byUserId: ev.actorUserId ?? null, eventId: ev.id, confirmed: null };
      break;
    }
    case "project.baseline.confirmed": {
      // A second person confirms the number that stands (RES D16): the one named, while the project has not started. A new baseline cleared the confirmation.
      const b = p.baseline;
      if (!b || b.none || b.confirmed || p.startedDay !== null || !live || !revisionMatches(pl.baselineEventId, b.eventId)) break;
      b.confirmed = { byUserId: ev.actorUserId ?? null, day: d };
      break;
    }
    case "project.help.asked": {
      // 'Ask the sponsor' (RES D19): a step still to do on a running project. The sponsor is the addressee; without one the role is filled in by finishProjects.
      const s = p.steps.find((x) => x.id === pl.stepId);
      const text = pl.text?.trim();
      if (!s || !text || s.column === "done" || s.dropped || p.startedDay === null || p.doneDay !== null || !live) break;
      const toUserId = p.sponsorUserId !== null && p.sponsorUserId !== p.leadUserId ? p.sponsorUserId : null;
      p.helpAsks.push({ id: ev.id, stepId: s.id, text, day: d, byUserId: ev.actorUserId ?? null, toUserId, toRoleId: null, answeredDay: null });
      break;
    }
    case "project.started":
      // A draft that waits for its approval does not start (plan GAT, D21); the server refuses it too.
      if (p.baseline && p.startedDay === null && live && !(p.waitsForApproval ?? false)) p.startedDay = d;
      break;
    case "project.step.added": {
      const stepId = pl.stepId;
      const text = pl.text?.trim();
      if (!stepId || !text || p.steps.some((s) => s.id === stepId)) break;
      // A card can start in any column but Blocked (that one needs its reason, so it is a move).
      p.steps.push(newStep(ev, d, { stepId, text, owner: pl.owner, ownerUserId: pl.ownerUserId, dueDay: pl.dueDay, note: pl.note, to: pl.to, external: pl.external }));
      break;
    }
    case "project.step.moved": {
      const s = p.steps.find((x) => x.id === pl.stepId);
      if (!s || !isColumn(pl.to)) break;
      touchedSteps.add(s);
      const changed = s.column !== pl.to;
      s.column = pl.to;
      if (s.column !== "blocked") s.waitingOn = null;
      else if (pl.waitingOn) {
        const w = pl.waitingOn;
        s.waitingOn = w.kind === "person" ? { kind: w.kind, userId: w.userId ?? null, name: null }
          : w.kind === "outside" ? { kind: w.kind, userId: null, name: w.name?.trim() ?? null }
          : { kind: "nobody", userId: null, name: null };
      } else if (changed) s.waitingOn = null;
      // A reorder inside the column keeps its day (and, without a new one, its reason).
      s.why = pl.why ?? (changed ? "" : s.why);
      if (changed) s.movedDay = d;
      if (pl.to !== "todo" && s.startedDay === null) s.startedDay = d;
      s.doneDay = pl.to === "done" ? (changed || s.doneDay === null ? d : s.doneDay) : null;
      // The board's order is the steps' order: a card lands above `before`, or at the bottom of its new
      // column. A move that names no place and keeps the column (a connector repeating a status) stays put.
      if (pl.before !== undefined || changed) placeStep(p, s.id, pl.before ?? null);
      break;
    }
    case "project.step.checklist": {
      const s = p.steps.find((x) => x.id === pl.stepId);
      if (!s || !live || p.reward !== null || !pl.itemId) break;
      const item = s.checklist.find((x) => x.id === pl.itemId);
      const text = pl.text?.trim();
      if (pl.op === "add") {
        if (item || s.checklist.length >= 30 || !text || text.length > 200) break;
        s.checklist.push({ id: pl.itemId, text, done: pl.done ?? false });
      } else {
        if (!item) break;
        if (pl.op === "edit" && text && text.length <= 200) item.text = text;
        else if (pl.op === "toggle" && typeof pl.done === "boolean") item.done = pl.done;
        else if (pl.op === "remove") s.checklist = s.checklist.filter((x) => x !== item);
        else break;
      }
      touchedSteps.add(s);
      break;
    }
    case "project.step.commented": {
      const s = p.steps.find((x) => x.id === pl.stepId);
      const text = pl.text?.trim();
      if (!s || !live || p.reward !== null || !text || text.length > 2000 || s.comments.some((x) => x.id === ev.id)) break;
      if (pl.replyTo != null && !s.comments.some((x) => x.id === pl.replyTo)) break;
      s.comments.push({ id: ev.id, text, byUserId: ev.actorUserId ?? null, by: ev.actor, day: d, replyTo: pl.replyTo ?? null });
      touchedSteps.add(s);
      break;
    }
    case "project.step.edited": {
      const s = p.steps.find((x) => x.id === pl.stepId);
      if (!s) break;
      if (pl.removed) { p.steps = p.steps.filter((x) => x !== s); break; }
      touchedSteps.add(s);
      const text = pl.text?.trim();
      if (text) s.text = text;
      if (pl.owner !== undefined) s.owner = pl.owner.trim() || null;
      if (pl.ownerUserId !== undefined) s.ownerUserId = pl.ownerUserId;
      if (pl.dueDay !== undefined) s.dueDay = typeof pl.dueDay === "number" ? pl.dueDay : null;
      if (pl.note !== undefined) s.note = pl.note.trim();
      if (pl.startDay !== undefined) s.startDay = typeof pl.startDay === "number" ? pl.startDay : null;
      if (pl.milestoneId !== undefined) s.milestoneId = pl.milestoneId !== null && p.milestones.some((m) => m.id === pl.milestoneId) ? pl.milestoneId : null;
      break;
    }
    case "project.milestone.added": {
      const id = pl.milestoneId;
      const title = pl.title?.trim();
      if (!id || !title || typeof pl.dueDay !== "number" || p.milestones.some((m) => m.id === id)) break;
      const startDay = typeof pl.startDay === "number" ? pl.startDay : null;
      const m: Milestone = { id, title, startDay, dueDay: pl.dueDay, note: pl.note?.trim() ?? "", shipped: false, shippedDay: null };
      // The Jira link and the pending write are the sync's alone (plan JSY D9, D20): from a person they are ignored.
      if (bySync) {
        const external = milestoneExternal(pl.external);
        if (external) m.external = external;
        const sync = milestoneSync(pl.sync);
        if (sync) m.sync = sync;
      }
      p.milestones.push(m);
      break;
    }
    case "project.milestone.edited": {
      const m = p.milestones.find((x) => x.id === pl.milestoneId);
      if (!m) break;
      if (pl.removed) {
        // A removed milestone leaves a tombstone: the sync archives an owned version from it and never imports it again (D22).
        p.milestoneTombstones = [...(p.milestoneTombstones ?? []), { id: m.id, title: m.title, external: m.external ?? null, day: d }];
        p.milestones = p.milestones.filter((x) => x !== m);
        p.steps.forEach((s) => { if (s.milestoneId === m.id) s.milestoneId = null; });
        break;
      }
      if (bySync) {
        // The link is set once and never replaced by another version or another mode (D20: lost ownership is never claimed back).
        const external = milestoneExternal(pl.external);
        if (external && !m.external) m.external = external;
        if (pl.sync === null) m.sync = null;
        else { const sync = milestoneSync(pl.sync); if (sync) m.sync = sync; }
      }
      // An imported milestone is a read-only view of a Jira version: a person's field edits are ignored (their steps are not).
      if (m.external?.mode === "imported" && !bySync) break;
      const title = pl.title?.trim();
      if (title) m.title = title;
      if (pl.startDay !== undefined) m.startDay = typeof pl.startDay === "number" ? pl.startDay : null;
      if (typeof pl.dueDay === "number") m.dueDay = pl.dueDay;
      if (pl.note !== undefined) m.note = pl.note.trim();
      if (typeof pl.shipped === "boolean" && pl.shipped !== m.shipped) { m.shipped = pl.shipped; m.shippedDay = pl.shipped ? d : null; }
      break;
    }
    case "project.form.saved": {
      const title = pl.title?.trim();
      if (!pl.formId || !title || !Array.isArray(pl.fields) || pl.fields.length === 0) break;
      const fields = pl.fields.map((x) => ({ id: x.id, kind: x.kind, label: x.label.trim(), required: x.required === true, ...(x.kind === "choice" && x.options ? { options: x.options.map((o) => o.trim()) } : {}) }));
      const form = p.forms.find((x) => x.id === pl.formId);
      const rev = (form?.rev ?? 0) + 1;
      const next = { id: pl.formId, title, intro: pl.intro?.trim() ?? "", fields, shared: pl.shared === true, rev, revisions: [...(form?.revisions ?? []), { rev, fields }] };
      if (form) Object.assign(form, next); else p.forms.push(next);
      break;
    }
    case "project.form.answered": {
      const form = p.forms.find((x) => x.id === pl.formId);
      if (!form || !form.shared || !live || pl.formRev !== form.rev || !pl.requestId || p.requests.some((x) => x.id === pl.requestId)) break;
      const answers: Record<string, string> = {};
      for (const f of form.fields) { const v = pl.answers?.[f.id]; if (typeof v === "string" && v.trim()) answers[f.id] = v.trim(); }
      p.requests.push({ id: pl.requestId, formId: form.id, formRev: form.rev, answers, byUserId: ev.actorUserId ?? null, day: d, state: "new", stepId: null, why: null });
      break;
    }
    case "project.request.stepped": {
      const r = p.requests.find((x) => x.id === pl.requestId);
      const a = typeof pl.step === "object" ? pl.step : undefined;
      const text = a?.text.trim();
      if (!r || r.state !== "new" || !a || !text || p.steps.some((s) => s.id === a.stepId)) break;
      p.steps.push(newStep(ev, d, { stepId: a.stepId, text, ownerUserId: a.ownerUserId, dueDay: a.dueDay, note: a.note, to: a.column }));
      r.state = "stepped";
      r.stepId = a.stepId;
      break;
    }
    case "project.request.declined": {
      const r = p.requests.find((x) => x.id === pl.requestId);
      const why = pl.why?.trim();
      if (!r || r.state !== "new" || !why) break;
      r.state = "declined";
      r.why = why;
      break;
    }
    case "project.request.reopened": {
      const r = p.requests.find((x) => x.id === pl.requestId);
      if (!r || r.state === "new") break;
      if (r.state === "stepped") {
        const step = untouchedStepOf(p, r);
        if (!step) break;
        p.steps = p.steps.filter((x) => x !== step);
      }
      r.state = "new";
      r.why = null;
      r.stepId = null;
      break;
    }
    case "project.linked": {
      // Only http(s) ever becomes an address on the page (the permissions refuse the rest too).
      const url = pl.url && /^https?:\/\//i.test(pl.url) ? pl.url : "";
      if (!url && !pl.key) break;
      const stepId = pl.stepId ?? null;
      p.links.push({ system: pl.system ?? "url", url, key: pl.key ?? "", stepId, day: d });
      const s = stepId ? p.steps.find((x) => x.id === stepId) : undefined;
      if (s && pl.key) { s.external = { system: pl.system ?? "url", key: pl.key, url: url || undefined }; touchedSteps.add(s); }
      break;
    }
    case "project.sync": {
      // Send it to the tool, or stop. Not once the project is stopped or recognised (the permissions refuse that too).
      const system = SYNC_SYSTEMS.find((x) => x === pl.system);
      if (!system || typeof pl.on !== "boolean" || !live || p.reward !== null) break;
      p.sync = { system, on: pl.on, day: d, by: ev.actor };
      break;
    }
    case "project.done":
      if (p.startedDay !== null && p.doneDay === null && live) {
        p.doneDay = d;
        p.doneNote = pl.note ?? "";
        // The Done sheet (RES D13, D28): each open step ends as done or as dropped with its reason. A step the list does not know, or that is
        // done already, is left alone; without the list (every old log) nothing else changes.
        if (Array.isArray(pl.openSteps)) {
          for (const o of pl.openSteps) {
            const s = p.steps.find((x) => x.id === o.stepId);
            if (!s || s.column === "done") continue;
            touchedSteps.add(s);
            if (o.end === "done") {
              s.column = "done";
              s.waitingOn = null;
              s.movedDay = d;
              s.doneDay = d;
              if (s.startedDay === null) s.startedDay = d;
            } else if (o.end === "dropped" && !s.dropped) {
              s.dropped = { why: o.why?.trim() ?? "", day: d, byUserId: ev.actorUserId ?? null };
            }
          }
        }
      }
      break;
    case "project.measured": {
      const check = pl.check;
      if (p.doneDay === null || typeof check !== "number" || !rules.measureDays.includes(check)) break;
      if (typeof pl.value !== "number") break;
      const have = p.measures.find((m) => m.check === check);
      // A second result for a check is taken once, and only as the re-entry of a number that was sent back (RES D14); it names the revision it replaces.
      if (have && !(have.sentBack && !have.reentered && revisionMatches(pl.measureEventId, have.eventId))) break;
      // No trusted system importer exists yet: a client-supplied system source is refused (LOOP/D18).
      if (typeof pl.source === "object" && pl.source !== null && pl.source.kind === "system") break;
      const src = readSource(pl.source);
      const v = verdictOf(p.baseline, pl.value, rules.tolerancePct);
      if (have) {
        // The replacement is a new revision: it has the re-entry's own identity, and nothing confirmed or questioned about the old number carries over.
        have.previous.push({ value: have.value, day: have.day, byUserId: have.byUserId });
        Object.assign(have, {
          value: pl.value, source: sourceLabel(src), note: pl.note ?? "", day: d, by: ev.actor, byUserId: ev.actorUserId ?? null,
          sourceKind: src.kind, sourceInfo: src, impact: readImpact(pl.impact), confirmed: false, confirmedByUserId: null, confirmedDay: null, ...v,
          eventId: ev.id, sentBack: false, reentered: true,
        });
        break;
      }
      p.measures.push({
        check, value: pl.value, source: sourceLabel(src), note: pl.note ?? "", day: d, by: ev.actor, byUserId: ev.actorUserId ?? null,
        sourceKind: src.kind, sourceInfo: src, impact: readImpact(pl.impact), confirmed: false, confirmedByUserId: null, confirmedDay: null, ...v,
        eventId: ev.id, sentBack: false, reentered: false, managerOnly: false, questions: [], previous: [],
      });
      p.measures.sort((a, b) => a.check - b.check);
      break;
    }
    case "project.measure.questioned": {
      const m = p.measures.find((x) => x.check === pl.check);
      if (!m || m.confirmed || m.sourceKind === "system" || m.managerOnly || m.sentBack || !revisionMatches(pl.measureEventId, m.eventId)) break;
      // The first questioning sends the check back; one after the re-entry leaves it to the managers (RES D14); any other is ignored.
      if (m.reentered) m.managerOnly = true;
      else if (m.questions.length === 0) m.sentBack = true;
      else break;
      m.questions.push({ day: d, why: pl.why?.trim() ?? "", byUserId: ev.actorUserId ?? null });
      break;
    }
    case "project.measure.confirmed": {
      const m = p.measures.find((x) => x.check === pl.check);
      // A number that was sent back is not confirmed, and a confirmation names the revision it is for: one for a replaced number never confirms its replacement (RES review).
      if (!m || m.confirmed || m.sentBack || m.sourceKind === "system" || !revisionMatches(pl.measureEventId, m.eventId)) break;
      m.confirmed = true;
      m.confirmedByUserId = ev.actorUserId ?? null;
      m.confirmedDay = d;
      break;
    }
    case "project.rewarded":
      if (!p.reward) p.reward = { rule: pl.rule ?? rules.reward.kind, amount: typeof pl.amount === "number" ? pl.amount : null, note: pl.note ?? "", day: d, by: ev.actor };
      break;
    case "project.claimed":
      if (p.reward && !p.claimed) p.claimed = { by: ev.actor, day: d };
      break;
    case "project.stopped":
      if (live && p.reward === null) p.stopped = { day: d, by: ev.actor, why: pl.why ?? "" };
      break;
    case "project.doneby.moved": {
      if (p.startedDay === null || p.doneDay !== null || !live || typeof pl.doneBy !== "number" || !Number.isInteger(pl.doneBy)) break;
      p.doneByMoves.push({ day: d, doneBy: pl.doneBy, why: pl.why?.trim() ?? "", byUserId: ev.actorUserId ?? null, byLead: p.leadUserId !== null && ev.actorUserId === p.leadUserId });
      break;
    }
    case "project.paused": {
      if (p.startedDay === null || p.doneDay !== null || !live || typeof pl.untilDay !== "number" || !Number.isInteger(pl.untilDay)) break;
      p.pausedUntil = pl.untilDay;
      p.pauseWhy = pl.why?.trim() ?? "";
      break;
    }
    case "project.resumed":
      if (live) { p.pausedUntil = null; p.pauseWhy = ""; }
      break;
    case "project.howwework": {
      const weekday = pl.checkInWeekday;
      if (!live || p.doneDay !== null || typeof weekday !== "number" || !Number.isInteger(weekday) || weekday < 1 || weekday > 5) break;
      p.checkInWeekday = weekday;
      p.howWeWorkNote = pl.note?.trim() ?? "";
      break;
    }
    case "project.update": {
      const text = pl.text?.trim();
      if (p.startedDay === null || !live || !text || typeof pl.week !== "number") break;
      p.latestUpdate = { text, week: pl.week, day: d, byUserId: ev.actorUserId ?? null };
      break;
    }
    case "project.lead.vacated": {
      const userId = pl.userId;
      if (!live || !userId || userId !== p.leadUserId) break;
      // The label stays for the timeline; the page shows "No lead" from leadUserId.
      p.leadUserId = null;
      p.leadVacatedDay = d;
      freeSteps(p, userId);
      break;
    }
    case "project.lead.changed": {
      const toUserId = pl.toUserId ?? null;
      if (!live || p.leadVacatedDay === null || toUserId === null) break;
      const to = pl.to?.trim() ?? "";
      p.memberUserIds = p.memberUserIds.filter((u) => u !== toUserId);
      if (to) p.members = p.members.filter((m) => m !== to);
      if (to) p.lead = to;
      p.leadUserId = toUserId;
      p.leadVacatedDay = null;
      break;
    }
    case "project.commented":
    default:
      break;
  }
  p.history.push(ev);
  return true;
}

type Finish = { day: number; promise: number; rules: LoopRules; projectStartDays?: number; routeOf: (id: string | null) => Route | null; seats?: readonly SeatRow[]; workdays?: boolean };

/**
 * The help asks of a project once its log is replayed (RES D19). An ask with no sponsor goes to a role: the route's owner role, or the deputy's when
 * the lead holds the owner seat (`toRoleId`, the same rule the stalled escalation uses; no route, no role). It is answered by the asked person's next
 * project.commented (the sponsor, or a holder of a seat of that role) in the log's order, and it stops waiting when its step is done, dropped or
 * removed, or the project is no longer running.
 */
function finishHelpAsks(p: ReducedProject, roleId: string | null, seats: readonly SeatRow[], day: number): void {
  for (const ask of p.helpAsks) {
    ask.toRoleId = ask.toUserId === null ? roleId : null;
    const at = p.history.findIndex((e) => e.id === ask.id);
    const asked = (e: CaseEvent) => e.actorUserId != null && (e.actorUserId === ask.toUserId
      || (ask.toRoleId !== null && seats.some((s) => s.roleId === ask.toRoleId && s.userId === e.actorUserId)));
    const answered = p.history.find((e, i) => i > at && e.type === "project.commented" && asked(e))?.day;
    const step = p.steps.find((x) => x.id === ask.stepId);
    const ended = !step ? p.history.find((e) => e.type === "project.step.edited" && e.payload.stepId === ask.stepId && e.payload.removed)?.day ?? day
      : step.dropped ? step.dropped.day
      : step.column === "done" ? step.doneDay ?? day
      : p.status !== "running" ? p.stopped?.day ?? p.doneDay ?? p.reward?.day ?? day
      : undefined;
    const days = [answered, ended].filter((x): x is number => x !== undefined);
    ask.answeredDay = days.length > 0 ? Math.min(...days) : null;
  }
}

/** Derived per project once every event is applied: status, checks, due day, escalation. */
export function finishProjects(book: ProjectBook, { day, promise, rules, projectStartDays = rules.projectStartDays, routeOf, seats = [], workdays = false }: Finish): ReducedProject[] {
  const list = book.order.map((id) => book.byId[id]);
  list.forEach((p, k) => {
    p.number = k + 1;
    const counted = p.baseline !== null && !p.baseline.none && rules.measure;
    p.checks = p.doneDay !== null && counted
      ? rules.measureDays.map((check): CheckDue => {
          const opensDay = (p.doneDay as number) + check;
          // A number that was sent back counts as not measured; it is due again `promise` working days after the latest questioning (RES D14).
          const measured = p.measures.some((m) => m.check === check && !m.sentBack);
          const back = p.measures.find((m) => m.check === check && m.sentBack)?.questions.at(-1);
          const dueDay = Math.max(opensDay + promise, back ? back.day + promise : 0);
          return { check, opensDay, dueDay, measured, late: !measured && day > dueDay };
        })
      : [];
    const allMeasured = p.checks.every((c) => c.measured);

    p.status = p.stopped ? "stopped"
      : p.reward ? "recognised"
      : p.doneDay !== null ? (allMeasured ? "measured" : "measuring")
      : p.startedDay !== null ? "running"
      : "planning";

    // The latest result that stands: a number sent back is not one (RES D14).
    const standing = p.measures.filter((m) => !m.sentBack);
    const last = standing[standing.length - 1];
    p.verdict = !rules.measure ? null : last ? last.verdict : p.doneDay !== null && !counted ? "not measured" : null;
    // A reward falls due only on a confirmed latest measure with verdict better (LOOP/D18).
    const counts = rules.measure && last !== undefined && last.confirmed;
    p.rewardDue = p.status === "measured" && rules.recognition && rules.reward.kind !== "none" && counts && last.verdict === "better";
    // The day the confirmation made the reward due (RES D17): the later of the result's day and its confirmation's.
    p.rewardDueDay = p.rewardDue && last ? Math.max(last.day, last.confirmedDay ?? last.day) : null;
    const noRewardPossible = rules.reward.kind === "none" || !rules.recognition || !rules.measure || (counts && last.verdict !== "better");
    // A project done without a baseline number is "not measured" and closes at done, also under a reward rule (MOV D24).
    p.closed = p.status === "stopped" || p.status === "recognised" || (p.status === "measured" && (noRewardPossible || p.baseline?.none === true));

    // The done-by date: the latest move, else the goal's, else the default after the start (MOV D19).
    const moved = p.doneByMoves[p.doneByMoves.length - 1];
    p.doneBy = p.startedDay === null ? null : moved?.doneBy ?? p.goal?.doneBy ?? p.startedDay + DONE_BY_DEFAULT_DAYS;
    // The latest day of the project moving (MOV D12). A pause ends by itself once `day` is past pausedUntil; the field is kept
    // as it is (paused means day <= pausedUntil), so the clock reads the end from it and from the history (pauseEndedDay).
    p.lastActivityDay = p.startedDay === null ? null : p.history.reduce((m, e) => (ACTIVITY_TYPES.has(e.type) ? Math.max(m, e.day | 0) : m), p.startedDay);

    const nextCheck = p.checks.find((c) => !c.measured);
    // A draft in planning has the start day of D14, none while the lead has not taken it; every other project keeps today's rule.
    const draftPlanning = p.draft && p.status === "planning";
    const facts = draftPlanning ? factsOf(p) : null;
    // The conditions approvers named join the brief the lead wrote (GAT D22); the goal's own text stays what it was written as.
    const conditions = conditionsOf.get(p) ?? [];
    if (p.goal !== null && conditions.length > 0) p.goal = { ...p.goal, brief: [p.goal.brief, ...conditions].filter(Boolean).join("\n\n") };
    // A draft that waits for approval has no start day, like one whose lead has not taken it (GAT D21).
    const waiting = p.waitsForApproval ?? false;
    if (facts) {
      const taken = p.leadState === "taken" && !waiting ? facts.takenDay : null;
      p.startDay = taken === null ? null : facts.movedStart ?? Math.max(taken, p.approvalsPendingSince ?? taken) + projectStartDays;
    }
    p.dueDay = facts ? p.startDay : p.status === "planning" ? p.openedDay + promise : p.status === "measuring" && nextCheck ? nextCheck.dueDay : null;
    p.overdue = p.dueDay !== null && day > p.dueDay;
    const route = routeOf(p.routeId);
    // The lead is the route owner when the owner seat's user is the lead's user (by id, never by name).
    const ownerUser = route?.ownerSeatId ? seats.find((s) => s.id === route.ownerSeatId)?.userId ?? null : null;
    const leadIsOwner = p.leadUserId !== null && ownerUser === p.leadUserId;
    const to = route ? (leadIsOwner ? route.deputy : route.owner.name) : null;
    const toSeatId = route ? (leadIsOwner ? route.deputySeatId : route.ownerSeatId) ?? null : null;
    const toRoleId = route ? (leadIsOwner ? route.deputyRoleId : route.ownerRoleId) ?? null : null;
    finishHelpAsks(p, toRoleId, seats, day);
    if (!workdays) {
      p.escalated = p.overdue && to && p.dueDay !== null
        ? { to, toSeatId, toRoleId, from: p.lead, day: p.dueDay + 1, live: p.dueDay + 1 >= 0, what: draftPlanning ? "draft" : p.status === "planning" ? "start" : "measure" }
        : null;
      return;
    }
    if (facts) {
      // A draft (D15): the latest draft fact since the lead last changed, for the lead now; it ends when the start day is moved.
      const from = facts.reassignedAt + 1;
      const at = p.history.findLastIndex((e, i) => i >= from && e.type === "clock.due" && e.payload.kind === "draft" && (e.payload.userId === undefined || e.payload.userId === null || e.payload.userId === p.leadUserId));
      const fact = at >= 0 ? p.history[at] : undefined;
      const seat = fact ? seats.find((s) => s.id === fact.payload.toRoleHolderId) : undefined;
      p.escalated = fact && seat && p.leadState === "taken" && !waiting
        ? { to: seat.label, toSeatId: seat.id, toRoleId: seat.roleId, from: p.lead, day: (fact.payload.dueDay ?? p.dueDay ?? 0) + 1, live: facts.movedAt < at, what: "draft" }
        : null;
      return;
    }
    if (p.status === "running") {
      // A stalled fact (MOV D12) stands until something after it, in the order of the log (not by day alone), moved the project:
      // activity, a new done-by date, a pause or a new lead. Done and stop leave the running status.
      const at = p.history.findLastIndex((e) => e.type === "clock.due" && e.payload.kind === "stalled");
      const fact = at >= 0 ? p.history[at] : undefined;
      const seat = fact ? seats.find((x) => x.id === fact.payload.toRoleHolderId) : undefined;
      const toUserId = fact?.payload.userId ?? null;
      const standing = fact !== undefined && (seat !== undefined || toUserId !== null) && !p.history.some((e, i) => i > at && STALLED_ENDERS.has(e.type));
      p.escalated = standing && fact
        ? { to: seat?.label ?? "", toSeatId: seat?.id ?? null, toRoleId: seat?.roleId ?? null, toUserId, from: p.lead, day: fact.payload.dueDay ?? 0, live: true, what: "stalled" }
        : null;
      return;
    }
    // Workdays (D11): a start fact while planning, a measure fact for a check still owed; nothing else escalates.
    const what = p.status === "planning" ? "start" : p.status === "measuring" ? "measure" : null;
    const fact = what === null ? undefined : [...p.history].reverse().find((e) => {
      if (e.type !== "clock.due" || e.payload.kind !== what) return false;
      return what === "start" || p.checks.some((c) => c.check === e.payload.check && !c.measured);
    });
    const seat = fact ? seats.find((s) => s.id === fact.payload.toRoleHolderId) : undefined;
    p.escalated = fact && seat && what
      ? { to: seat.label, toSeatId: seat.id, toRoleId: seat.roleId, from: p.lead, day: (fact.payload.dueDay ?? p.dueDay ?? 0) + 1, live: true, what }
      : null;
  });
  return list;
}
