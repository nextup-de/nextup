// The project half of reduce(seed, log) (features/cases/reducer.ts calls into this). A project
// opens with the case.decided yes that names it, and changes only through project.* events.
// Pure like the case reducer: state in, state out, nothing stored.
import type { SeatRow } from "@/features/auth/identity";
import type { CaseEvent } from "@/features/cases/events";
import type { Route } from "@/features/demo/types";
import type { LoopRules } from "@/features/loop/rules";
import { templateSteps } from "@/features/templates/library";
import type { CheckDue, Invite, InviteRole, ReducedProject, SeedProject, Step, StepColumn } from "./types";
import { STEP_COLUMNS, SYNC_SYSTEMS } from "./types";
import { readImpact, readSource, sourceLabel } from "./measure-source";
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

/** One project.* event. Returns false when the event is not a project event at all. */
export function applyProjectEvent(book: ProjectBook, ev: CaseEvent, rules: LoopRules): boolean {
  const isFact = ev.type === "clock.due"; // a stored due fact (CLK/D10) on a project; on a case the case reducer takes it
  if (!isFact && !ev.type.startsWith("project.")) return false;
  const p = ev.target ? book.byId[ev.target] : undefined;
  if (!p) return !isFact;
  const pl = ev.payload ?? {};
  const d = ev.day | 0;
  const live = p.stopped === null;
  switch (ev.type) {
    case "project.member": {
      const userId = pl.userId;
      if (!userId || userId === p.leadUserId) break;
      const name = pl.name?.trim() ?? "";
      if (pl.on === false) {
        p.memberUserIds = p.memberUserIds.filter((u) => u !== userId);
        if (name) p.members = p.members.filter((m) => m !== name); // the shown list only
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
          id, text: t.text, owner: null, ownerUserId: null, dueDay: f.takenDay === null ? null : f.takenDay + t.day, column: "todo", why: "", note: "",
          addedDay: d, by: ev.actor, byUserId: ev.actorUserId ?? null, movedDay: d, startedDay: null, doneDay: null, external: null, role: t.role,
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
      if (pl.none) p.baseline = { none: true, why: pl.why ?? "", day: d, by: ev.actor };
      else if (typeof pl.value === "number" && Number.isFinite(pl.value) && pl.metric)
        p.baseline = { none: false, metric: pl.metric, unit: pl.unit ?? "", value: pl.value, better: pl.better === "up" ? "up" : "down", source: typeof pl.source === "string" ? pl.source : "", day: d, by: ev.actor };
      break;
    }
    case "project.started":
      if (p.baseline && p.startedDay === null && live) p.startedDay = d;
      break;
    case "project.step.added": {
      const stepId = pl.stepId;
      const text = pl.text?.trim();
      if (!stepId || !text || p.steps.some((s) => s.id === stepId)) break;
      // A card can start in any column but Blocked (that one needs its reason, so it is a move).
      const column: StepColumn = isColumn(pl.to) && pl.to !== "blocked" ? pl.to : "todo";
      p.steps.push({
        id: stepId, text, owner: pl.owner?.trim() || null, ownerUserId: pl.ownerUserId ?? null, dueDay: typeof pl.dueDay === "number" ? pl.dueDay : null,
        column, why: "", note: pl.note?.trim() ?? "", addedDay: d, by: ev.actor, byUserId: ev.actorUserId ?? null, movedDay: d,
        startedDay: column === "todo" ? null : d, doneDay: column === "done" ? d : null,
        external: pl.external?.system && pl.external.key ? { system: pl.external.system, key: pl.external.key, url: pl.external.url } : null,
      });
      break;
    }
    case "project.step.moved": {
      const s = p.steps.find((x) => x.id === pl.stepId);
      if (!s || !isColumn(pl.to)) break;
      touchedSteps.add(s);
      const changed = s.column !== pl.to;
      s.column = pl.to;
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
      if (p.startedDay !== null && p.doneDay === null && live) { p.doneDay = d; p.doneNote = pl.note ?? ""; }
      break;
    case "project.measured": {
      const check = pl.check;
      if (p.doneDay === null || typeof check !== "number" || !rules.measureDays.includes(check)) break;
      if (typeof pl.value !== "number" || p.measures.some((m) => m.check === check)) break;
      // No trusted system importer exists yet: a client-supplied system source is refused (LOOP/D18).
      if (typeof pl.source === "object" && pl.source !== null && pl.source.kind === "system") break;
      const src = readSource(pl.source);
      const v = verdictOf(p.baseline, pl.value, rules.tolerancePct);
      p.measures.push({
        check, value: pl.value, source: sourceLabel(src), note: pl.note ?? "", day: d, by: ev.actor, byUserId: ev.actorUserId ?? null,
        sourceKind: src.kind, sourceInfo: src, impact: readImpact(pl.impact), confirmed: false, confirmedByUserId: null, confirmedDay: null, ...v,
      });
      p.measures.sort((a, b) => a.check - b.check);
      break;
    }
    case "project.measure.confirmed": {
      const m = p.measures.find((x) => x.check === pl.check);
      if (!m || m.confirmed || m.sourceKind === "system") break;
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
    case "project.commented":
    default:
      break;
  }
  p.history.push(ev);
  return true;
}

type Finish = { day: number; promise: number; rules: LoopRules; projectStartDays?: number; routeOf: (id: string | null) => Route | null; seats?: readonly SeatRow[]; workdays?: boolean };

/** Derived per project once every event is applied: status, checks, due day, escalation. */
export function finishProjects(book: ProjectBook, { day, promise, rules, projectStartDays = rules.projectStartDays, routeOf, seats = [], workdays = false }: Finish): ReducedProject[] {
  const list = book.order.map((id) => book.byId[id]);
  list.forEach((p, k) => {
    p.number = k + 1;
    const counted = p.baseline !== null && !p.baseline.none && rules.measure;
    p.checks = p.doneDay !== null && counted
      ? rules.measureDays.map((check): CheckDue => {
          const opensDay = (p.doneDay as number) + check;
          const measured = p.measures.some((m) => m.check === check);
          return { check, opensDay, dueDay: opensDay + promise, measured, late: !measured && day > opensDay + promise };
        })
      : [];
    const allMeasured = p.checks.every((c) => c.measured);

    p.status = p.stopped ? "stopped"
      : p.reward ? "recognised"
      : p.doneDay !== null ? (allMeasured ? "measured" : "measuring")
      : p.startedDay !== null ? "running"
      : "planning";

    const last = p.measures[p.measures.length - 1];
    p.verdict = !rules.measure ? null : last ? last.verdict : p.doneDay !== null && !counted ? "not measured" : null;
    // A reward falls due only on a confirmed latest measure with verdict better (LOOP/D18).
    const counts = rules.measure && last !== undefined && last.confirmed;
    p.rewardDue = p.status === "measured" && rules.recognition && rules.reward.kind !== "none" && counts && last.verdict === "better";
    const noRewardPossible = rules.reward.kind === "none" || !rules.recognition || !rules.measure || (counts && last.verdict !== "better");
    p.closed = p.status === "stopped" || p.status === "recognised" || (p.status === "measured" && noRewardPossible);

    const nextCheck = p.checks.find((c) => !c.measured);
    // A draft in planning has the start day of D14, none while the lead has not taken it; every other project keeps today's rule.
    const draftPlanning = p.draft && p.status === "planning";
    const facts = draftPlanning ? factsOf(p) : null;
    if (facts) {
      const taken = p.leadState === "taken" ? facts.takenDay : null;
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
      p.escalated = fact && seat && p.leadState === "taken"
        ? { to: seat.label, toSeatId: seat.id, toRoleId: seat.roleId, from: p.lead, day: (fact.payload.dueDay ?? p.dueDay ?? 0) + 1, live: facts.movedAt < at, what: "draft" }
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
