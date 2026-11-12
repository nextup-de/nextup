// reduce(seed, log) -> { day, cases, ideas, problems, ledger }. Port of legacy/demo/js/store.js.
//
// Nothing mutates the seed. Every count, clock and status on the page is derived from
// seed + events at render time; a backend later just becomes another place the same events
// come from. Pure: never reads the DOM, never touches storage. Only Kevin changes this file.
//
// Time: `log.day` is the demo clock, 0 = today. Seed cases carry `raisedDay` as a negative
// offset; age = day - raisedDay. A paused clock (question sent) does not count towards the promise.
import { DEMO_CLOCK, type ClockSpec } from "@/features/clock";
import { byClock } from "@/features/clock/actor";
import type { SeatRow } from "@/features/auth/identity";
import { EMPTY_APPROVAL_CONFIG, type ApprovalConfig, type ApprovalRoleInfo, type CaseApprovals, type CaseCost, type CaseReview } from "@/features/approvals/types";
import type { CaseEvent, CaseKind, EventLog } from "./events";
import { cycleEvents, noCategoryOf, type AnyNoCategory } from "./no";
import { fallbackSeat } from "./stamp";
import type { Idea, Problem, Route, SeedCase, SeedRole } from "@/features/demo/types";
import { loopRules, type LoopRules } from "@/features/loop/rules";
import { applyProjectEvent, finishProjects, newBook, openOrJoin, seedProject } from "@/features/projects/reduce";
import type { ReducedProject, SeedProject } from "@/features/projects/types";

// A yes that names a project opens it (or adds this idea to it): the idea is archived from then on.
export type Decision = {
  answer: "yes" | "no"; reason: string; note: string; by: string; day: number; projectId?: string | null; lead?: string | null; byUserId?: string | null;
  // The reasoned no (plan NOR): the category of a no, what would make it a yes, the day it comes back, the case or project it duplicates.
  category: AnyNoCategory | null; changeIf: string; revisitDay: number | null; duplicateOf: string | null;
};
/** `fromSeatId`: the seat the case came from (Not mine goes back to it); `back` and `up`: the pass was Not mine / Send up (plan NOR, D13). */
export type HandOver = { from: string; fromUserId: string | null; to: string; toSeatId: string | null; why: string; day: number; fromSeatId: string | null; back: boolean; up: boolean };
export type Answer = { text: string; by: string; byUserId: string | null; day: number };
/** `unanswered`: the day the clock gave the case back to the desk without an answer; null while it waits or once answered. */
export type Question = { text: string; by: string; byUserId: string | null; day: number; answer: Answer | null; unanswered: number | null };
export type Building = { day: number; days: number; expected: string; by: string; byUserId: string | null };
export type Shipped = { day: number; outcome: string; outcomeNote: string; by: string; byUserId: string | null };
export type Override = { proposed: string | null; chosen: string; day: number; by: string; byUserId: string | null };
// The promise rule (§11): miss the date and it moves to the deputy automatically. `live` = it
// crossed the line during this demo session (day 0 or later) - what the manager's ledger counts.
export type Escalation = { to: string; from: string; day: number; live: boolean; toSeatId: string | null; toRoleId: string | null };
// The discussion stage (docs/plans/2026-10-15_idea-to-project.md): people are invited, the raiser
// revises, and every `discussEveryDays` a check-in ends the round - the next one or the decision.
export type CheckIn = { round: number; day: number; by: string; byUserId: string | null; next: "round" | "decide"; open: string[]; note: string };
export type Discussion = {
  startedDay: number; by: string; byUserId: string | null; invited: string[]; invitedUserIds: string[]; missing: string; rounds: CheckIn[];
  // derived: the round under way (the next check-in ends it), whether the last check-in said "decide",
  // and the day the last allowed round ends
  round: number; ready: boolean; lastDay: number;
  /** People who said the discussion is not for them (case.invite.declined, plan NOR D14). */
  declinedUserIds: string[];
};
// v1 is the case as raised; each case.revised adds the next one.
export type Version = { version: number; day: number; by: string; byUserId?: string | null; title: string; body: string; overall: number | null };
export type CaseStatus = "open" | "discussion" | "decided" | "asked" | "building" | "shipped" | "withdrawn" | "merged" | "approval";

/** The raiser took the idea back before anyone decided it (decision Q1.14). */
export type Withdrawal = { day: number; by: string; byUserId: string | null; note: string };

/** The raiser's second look at a no (plan NOR, D18). `seatId`: the desk the server set, null when no occupied seat could take it; `decided`: its answer. */
export type Appeal = {
  text: string; day: number; by: string; byUserId: string | null; seatId: string | null;
  decided: { uphold: boolean; reason: string; by: string; byUserId: string | null; day: number } | null;
};

/** The desk closed the case as a duplicate of `into` (plan SEE, D17): archived, off the desk, its clock stopped on `day`. */
export type Merge = { into: string; day: number; by: string; byUserId: string | null; note: string };

/** The case is open on a desk again (plan NOR, D12): a no came back on its revisit day, a second look was not upheld, or a stopped project's idea went back. */
export type Reopen = { why: "revisit" | "appeal" | "stopped"; day: number; by: string };

export type ReducedCase = {
  id: string; seed: boolean; kind: CaseKind; title: string; body: string; from: string; fromDept: string;
  // Ids next to the labels (IDN/D6): who raised it, and the seat and role it sits on. Null when unknown.
  fromUserId: string | null; assigneeSeatId: string | null; assigneeRoleId: string | null;
  routeId: string | null; assignee: string; raisedDay: number; reason: string; upside: string; linkedIdea: string | null;
  status: CaseStatus; read: number | null; decided: Decision | null; withdrawn: Withdrawal | null; question: Question | null; handed: HandOver[];
  building: Building | null; shipped: Shipped | null; override: Override | null;
  discussion: Discussion | null; versions: Version[];
  // The reasoned no (plan NOR): every decision of the case, oldest first (`decided` is the latest live one), the passes people
  // made, the not-now in a row, the second look, the reopens, the day the current cycle began and the floor of the answer date.
  decisions: Decision[]; passes: number; notNowInRow: number; appeal: Appeal | null; reopens: Reopen[]; cycleStartDay: number; dueFloor: number | null;
  // Event order (D12, review of 12 Nov): the place in `history` of the latest reopen and of the latest decision, null when none.
  // Two events of one day have a total order only by this place; see features/cases/no.ts decisionKey and cycleEvents.
  reopenSeq: number | null; decidedSeq: number | null;
  // The raiser sees the whole way (plan SEE): the case this one follows up and the cases that follow it (D15), the cases the
  // raise looked like (D16), the merge into another case and the raisers merged into this one (D17), the cases linked as related.
  // `mergedIn` carries user ids for the reducer's readers (the affected count by user id); a page shows only the count.
  follows: string | null; followedBy: string[]; sameAs: string | null; related: string[]; merged: Merge | null;
  mergedIn: { id: string; userId: string | null; day: number }[]; links: string[];
  // Review and approvals (plan GAT, D12, D14, D18, D21, D32, D33): the review of the raise, the latest cost estimate, the active approval
  // run and the finished ones, and the id of the run whose final yes decided the case. null, null, null, [] and null until GAT's events.
  review: CaseReview | null; cost: CaseCost | null; approvals: CaseApprovals | null; approvalRuns: CaseApprovals[]; openingRunId: string | null;
  pausedDays: number; pausedSince: number | null; history: CaseEvent[];
  // derived once every event is applied. `open` = still on a desk, waiting for a move: open or in discussion.
  // `archived` = decided either way, or withdrawn by the raiser; a yes then lives on as `decided.projectId`.
  route: Route | null; age: number; clock: number; open: boolean; archived: boolean; overdue: boolean; dueDay: number; escalated: Escalation | null;
};

export type Cosign = { name: string; userId: string | null; day: number };
export type IdeaQuestion = { text: string; by: string; byUserId: string | null; day: number; answer: null };
export type Approval = { by: string; byUserId: string | null; day: number; note: string; funded: boolean };
export type ReducedIdea = Idea & { cosigners: Cosign[]; thread: IdeaQuestion[]; approved: Approval | null; seedWait: number };
export type ReducedProblem = Problem;

// The Wait ledger, now past the decision too: late starts and late measures move to the deputy.
export type LedgerCounts = {
  handedOver: number; escalated: number; overrides: number;
  projectsEscalated: number; measuresOwed: number; unmeasured: number;
};
export type State = {
  day: number; cases: ReducedCase[]; ideas: ReducedIdea[]; problems: ReducedProblem[]; projects: ReducedProject[];
  ledger: LedgerCounts; rules: LoopRules; seats: SeatRow[]; routes: Route[]; clock: ClockSpec;
  /** The company's review and approval settings and its roles' titles and spend limits, as the seed carried them (plan GAT, D27); the empty config and no roles without. */
  approvals: ApprovalConfig & { roles: ApprovalRoleInfo[] };
};

export type ReduceSeed = {
  cases: SeedCase[]; ideas: Idea[]; problems: Problem[]; routes: Route[]; promiseDays: number;
  projects?: SeedProject[]; loop?: Partial<LoopRules>; seats?: SeatRow[];
  roles?: readonly SeedRole[]; // the org chart, read for the fallback desk of a reopened case (plan NOR, D12) and, with their title and spend limit, by GAT
  approvals?: ApprovalConfig; // the company's review and approval settings (plan GAT, D27); missing = the empty config
  clock?: ClockSpec; // missing = demo (render-time escalation); workdays = escalation only from clock.due facts (CLK/D11)
};

type CaseRow = { kind?: CaseKind; title: string; body?: string; from: string; fromDept?: string; routeId?: string | null; assignee: string; raisedDay?: number; reason?: string; upside?: string; linkedIdea?: string; fromUserId?: string | null; seatId?: string | null };

export function reduce(seed: ReduceSeed, log: EventLog): State {
  const day = log.day | 0;
  const routes = seed.routes;
  const routeOf = (id: string | null) => routes.find((r) => r.id === id) ?? null;
  const seats = seed.seats ?? [];
  const clock = seed.clock ?? DEMO_CLOCK;
  const workdays = clock.mode === "workdays";
  const roleOfSeat = (seatId: string | null) => (seatId === null ? null : seats.find((s) => s.id === seatId)?.roleId ?? null);

  const cases: Record<string, ReducedCase> = {};
  const order: string[] = [];
  const ideas: Record<string, ReducedIdea> = {};
  const problems: Record<string, ReducedProblem> = {};
  const rules = loopRules(seed.loop);
  const book = newBook();
  // The answer date a reopen carried (case.reopened dueDay): the new cycle's own, when the clock gave one.
  const cycleDue = new Map<string, number>();
  const occupiedSeat = (seatId: string | null | undefined) => (seatId ? seats.find((x) => x.id === seatId && x.userId !== null) ?? null : null);

  const freshCase = (id: string, row: CaseRow, isSeed: boolean): ReducedCase => {
    const c: ReducedCase = {
      id, seed: isSeed, kind: row.kind ?? "problem", title: row.title, body: row.body ?? "", from: row.from, fromDept: row.fromDept ?? "",
      fromUserId: row.fromUserId ?? null, assigneeSeatId: row.seatId ?? null, assigneeRoleId: roleOfSeat(row.seatId ?? null),
      routeId: row.routeId ?? null, assignee: row.assignee, raisedDay: row.raisedDay ?? 0,
      reason: row.reason ?? "", upside: row.upside ?? "", linkedIdea: row.linkedIdea ?? null,
      status: "open", read: null, decided: null, withdrawn: null, question: null, handed: [], building: null, shipped: null,
      override: null, discussion: null, versions: [],
      decisions: [], passes: 0, notNowInRow: 0, appeal: null, reopens: [], cycleStartDay: row.raisedDay ?? 0, dueFloor: null, reopenSeq: null, decidedSeq: null,
      follows: null, followedBy: [], sameAs: null, related: [], merged: null, mergedIn: [], links: [],
      review: null, cost: null, approvals: null, approvalRuns: [], openingRunId: null,
      pausedDays: 0, pausedSince: null, history: [],
      route: null, age: 0, clock: 0, open: true, archived: false, overdue: false, dueDay: 0, escalated: null,
    };
    c.versions.push({ version: 1, day: c.raisedDay, by: c.from, byUserId: c.fromUserId, title: c.title, body: c.body, overall: null });
    cases[id] = c;
    order.push(id);
    return c;
  };

  seed.cases.forEach((row) => freshCase(row.id, { ...row, seatId: row.assigneeRoleHolderId ?? routeOf(row.routeId)?.ownerSeatId ?? null }, true));
  // An idea that is still waiting keeps waiting as the demo clock advances.
  seed.ideas.forEach((i) => {
    ideas[i.id] = { ...i, team: i.team.slice(), cosigners: [], thread: [], approved: null,
      wait: i.status === "Awaiting decision" ? i.wait + day : i.wait, seedWait: i.wait };
  });
  seed.problems.forEach((p) => { problems[p.id] = { ...p }; });
  (seed.projects ?? []).forEach((p) => seedProject(book, p));

  // Seed history first (in day order), then live events (in log order).
  const seedEvents: CaseEvent[] = [];
  const pushSeed = (target: string) => (ev: NonNullable<SeedCase["seedEvents"]>[number], k: number) =>
    seedEvents.push({ id: "seed_" + target + "_" + k, ts: 0, target, seed: true, type: ev.type, day: ev.day, actor: ev.actor, actorUserId: ev.actorUserId ?? null, payload: ev.payload ?? {} });
  seed.cases.forEach((row) => (row.seedEvents ?? []).forEach(pushSeed(row.id)));
  seed.ideas.forEach((row) => (row.seedEvents ?? []).forEach(pushSeed(row.id)));
  (seed.projects ?? []).forEach((row) => (row.seedEvents ?? []).forEach(pushSeed(row.id)));
  seedEvents.sort((a, b) => a.day - b.day);

  /**
   * The case is open on a desk again, in a new cycle from today (D12). The event is already in the history: its place is the
   * boundary every later reader uses, so two events of one day stay in order. The seat: the one the event named when it is
   * occupied, else the route owner's, else the fallback desk (features/cases/stamp.ts) - never an empty seat.
   */
  const reopen = (c: ReducedCase, ev: CaseEvent, why: Reopen["why"], seatHint: string | null, dueDay: number | null | undefined) => {
    const d = ev.day | 0;
    c.reopens.push({ why, day: d, by: ev.actor });
    c.reopenSeq = c.history.length - 1;
    c.decided = null;
    c.status = "open";
    c.question = null;
    c.discussion = null;
    c.cycleStartDay = d;
    c.pausedDays = 0;
    c.pausedSince = null;
    c.dueFloor = null;
    if (Number.isInteger(dueDay) && (dueDay as number) >= d) cycleDue.set(c.id, dueDay as number);
    else cycleDue.delete(c.id);
    const seat = occupiedSeat(seatHint) ?? occupiedSeat(routeOf(c.routeId)?.ownerSeatId) ?? fallbackSeat({ seats, roles: seed.roles });
    if (seat) {
      c.assignee = seat.label;
      c.assigneeSeatId = seat.id;
      c.assigneeRoleId = seat.roleId;
    }
  };

  const apply = (ev: CaseEvent) => {
    if (applyProjectEvent(book, ev, rules)) return;
    const pl = ev.payload ?? {};
    const d = ev.day | 0;
    const target = ev.target ?? "";
    const uid = ev.actorUserId ?? null;
    switch (ev.type) {
      case "case.raised": {
        const seatId = pl.assigneeRoleHolderId ?? routeOf(pl.routeId ?? null)?.ownerSeatId ?? null;
        const c = freshCase(target, { kind: pl.kind === "problem" || pl.kind === "idea" ? pl.kind : undefined, title: pl.title ?? "Untitled", body: pl.body, from: ev.actor, fromUserId: uid, fromDept: pl.fromDept, routeId: pl.routeId, assignee: pl.assignee ?? "Triage desk", raisedDay: d, reason: pl.reason ?? "triage", upside: pl.upside ?? "", seatId }, false);
        // The cases this raise follows up and looked like, when they exist and are not this one (plan SEE, D15, D16).
        const known = (id: unknown): id is string => typeof id === "string" && id !== target && cases[id] !== undefined;
        if (known(pl.follows)) {
          c.follows = pl.follows;
          if (!cases[pl.follows].followedBy.includes(target)) cases[pl.follows].followedBy.push(target);
        }
        if (known(pl.proposal?.sameAs)) c.sameAs = pl.proposal.sameAs;
        c.related = [...new Set((pl.proposal?.related ?? []).filter(known))];
        c.history.push(ev);
        break;
      }
      case "case.read": {
        const c = cases[target];
        if (!c || c.read !== null) break;
        c.read = d;
        c.history.push(ev);
        break;
      }
      case "case.decided": {
        const c = cases[target];
        if (!c || c.status === "merged") break; // a merged case is closed (plan SEE)
        if (c.read === null) c.read = d;
        if (c.pausedSince !== null) { c.pausedDays += d - c.pausedSince; c.pausedSince = null; }
        const answer = pl.answer === "no" ? "no" : "yes";
        // Only the first yes opens a project: a decision cannot fork an idea into two projects. After a reopen the case may
        // open a new one, unless an earlier decision's project is still open (not stopped).
        const stillOpen = c.decisions.some((x) => x.projectId != null && book.byId[x.projectId] !== undefined && !book.byId[x.projectId].stopped);
        const first = c.decided === null && !stillOpen;
        const project = first && answer === "yes" ? openOrJoin(book, ev, { id: c.id, from: c.from, fromUserId: c.fromUserId, routeId: c.routeId, title: c.title }) : null;
        const category = noCategoryOf({ answer, reason: pl.reason ?? "", category: pl.category });
        const decision: Decision = {
          answer, reason: pl.reason ?? "", note: pl.note ?? "", by: ev.actor, byUserId: uid, day: d,
          // A decision of this cycle keeps what an earlier decision of the same cycle had; a new cycle starts from nothing.
          projectId: project ? project.id : c.decided?.projectId ?? null, lead: project ? project.lead : c.decided?.lead ?? null,
          category, changeIf: (pl.changeIf ?? "").trim(), revisitDay: Number.isInteger(pl.revisitDay) ? (pl.revisitDay as number) : null,
          duplicateOf: typeof pl.duplicateOf === "string" && pl.duplicateOf !== "" ? pl.duplicateOf : null,
        };
        c.notNowInRow = category === "not-now" ? c.notNowInRow + 1 : 0;
        c.decisions.push(decision);
        c.decided = decision;
        c.status = "decided";
        c.history.push(ev);
        c.decidedSeq = c.history.length - 1;
        break;
      }
      case "case.discussion": {
        const c = cases[target];
        if (!c || c.status !== "open" || c.discussion) break;
        if (c.read === null) c.read = d;
        c.discussion = {
          startedDay: d, by: ev.actor, byUserId: uid, invited: uniq(pl.invited ?? []), invitedUserIds: uniqIds(pl.invitedUserIds ?? []), missing: pl.missing ?? "", rounds: [],
          round: 1, ready: false, lastDay: 0, declinedUserIds: [],
        };
        c.status = "discussion";
        c.history.push(ev);
        break;
      }
      case "case.invited": {
        const c = cases[target];
        if (!c || c.status !== "discussion" || !c.discussion) break;
        c.discussion.invited = uniq(c.discussion.invited.concat(pl.invited ?? []));
        c.discussion.invitedUserIds = uniqIds(c.discussion.invitedUserIds.concat(pl.invitedUserIds ?? []));
        c.history.push(ev);
        break;
      }
      case "case.revised": {
        const c = cases[target];
        if (!c || c.decided || !pl.body?.trim()) break;
        const title = pl.title?.trim() || c.title;
        c.versions.push({ version: c.versions.length + 1, day: d, by: ev.actor, byUserId: uid, title, body: pl.body, overall: typeof pl.overall === "number" ? pl.overall : null });
        c.title = title;
        c.body = pl.body;
        c.history.push(ev);
        break;
      }
      case "case.checkin": {
        const c = cases[target];
        if (!c || c.status !== "discussion" || !c.discussion || c.discussion.ready) break;
        const next = pl.next === "decide" ? "decide" : "round";
        c.discussion.rounds.push({ round: c.discussion.rounds.length + 1, day: d, by: ev.actor, byUserId: uid, next, open: (pl.open ?? []).slice(0, 12), note: pl.note ?? "" });
        if (next === "decide") c.discussion.ready = true;
        c.history.push(ev);
        break;
      }
      case "case.handed": {
        const c = cases[target];
        // A pass on an asked case is ignored, unless it says the open question stays open for the new holder (plan NOR, D13).
        const keeps = pl.keepsQuestion === true;
        if (!c || !(c.status === "open" || c.status === "discussion" || (c.status === "asked" && keeps)) || !pl.to) break;
        if (c.read === null) c.read = d;
        const toSeat = pl.toRoleHolderId ?? null;
        c.handed.push({ from: ev.actor, fromUserId: uid, to: pl.to, toSeatId: toSeat, why: pl.why ?? "", day: d, fromSeatId: c.assigneeSeatId, back: pl.back === true, up: pl.up === true });
        // The people's passes only: not the clock's, not a system actor's. Managers count too (the reducer knows no app roles).
        if (uid !== null && !byClock(ev) && !ev.actor.startsWith("system:")) c.passes += 1;
        c.assignee = pl.to;
        c.assigneeSeatId = toSeat;
        c.assigneeRoleId = roleOfSeat(toSeat);
        // The case's route moves with the pass; the new desk gets at least the date the writer asked for (Q4.9, Q4.10).
        if (typeof pl.routeId === "string" && routeOf(pl.routeId) !== null) c.routeId = pl.routeId;
        if (Number.isInteger(pl.dueDay)) c.dueFloor = Math.max(c.dueFloor ?? -Infinity, pl.dueDay as number);
        c.history.push(ev);
        break;
      }
      case "case.reopened": {
        // The case is open on a desk again (D12): a no came back on its revisit day (only the clock says so), or a stopped project's idea went back (a person).
        const c = cases[target];
        if (!c || c.status !== "decided" || c.decided === null) break;
        if (pl.why === "revisit") {
          if (!byClock(ev) || c.decided.answer !== "no") break;
        } else if (pl.why === "stopped") {
          if (byClock(ev)) break;
        } else break;
        c.history.push(ev);
        reopen(c, ev, pl.why, pl.toRoleHolderId ?? null, pl.dueDay);
        break;
      }
      case "case.appealed": {
        // The raiser's second look: once per case, at a no (D18).
        const c = cases[target];
        if (!c || c.status !== "decided" || c.decided?.answer !== "no" || c.appeal !== null) break;
        c.appeal = { text: (pl.text ?? "").trim(), day: d, by: ev.actor, byUserId: uid, seatId: pl.toRoleHolderId ?? null, decided: null };
        c.history.push(ev);
        break;
      }
      case "case.appeal.decided": {
        const c = cases[target];
        if (!c || c.status !== "decided" || c.appeal === null || c.appeal.decided !== null || typeof pl.uphold !== "boolean") break;
        c.appeal.decided = { uphold: pl.uphold, reason: (pl.reason ?? "").trim(), by: ev.actor, byUserId: uid, day: d };
        c.history.push(ev);
        // Not upheld: the case is open again on the route owner's desk, with a new answer date.
        if (!pl.uphold) reopen(c, ev, "appeal", null, undefined);
        break;
      }
      case "case.invite.declined": {
        // An invitee says the discussion is not for them (D14): off the list.
        const c = cases[target];
        if (!c || c.status !== "discussion" || !c.discussion || uid === null || !c.discussion.invitedUserIds.includes(uid)) break;
        if (!c.discussion.declinedUserIds.includes(uid)) c.discussion.declinedUserIds.push(uid);
        c.history.push(ev);
        break;
      }
      case "case.merged": {
        // The desk closes an undecided case as a duplicate of another (plan SEE, D17). The reducer does not check who wrote it (the server does).
        const c = cases[target];
        const destId = pl.into;
        const dest = typeof destId === "string" ? cases[destId] : undefined;
        // The target may be missing from a reader's log (viewer-log cuts a case they may not open, SEE D24): the merged case is still marked merged,
        // and only the target's side is skipped. A target the log does hold keeps every rule below.
        if (!c || typeof destId !== "string" || destId === c.id || dest === c) break;
        if (!(c.status === "open" || c.status === "asked" || c.status === "discussion") || c.decided !== null || c.withdrawn !== null || c.merged !== null) break;
        if (dest && (dest.merged !== null || dest.withdrawn !== null)) break;
        // A case that absorbed repeats stays the destination: it is not merged again, so every merge points at a case that stays and no chain or cycle can form.
        if (c.mergedIn.length > 0) break;
        if (c.pausedSince !== null) { c.pausedDays += d - c.pausedSince; c.pausedSince = null; }
        c.merged = { into: destId, day: d, by: ev.actor, byUserId: uid, note: (pl.note ?? "").trim().slice(0, 300) };
        c.status = "merged";
        dest?.mergedIn.push({ id: c.id, userId: c.fromUserId, day: d });
        c.history.push(ev);
        break;
      }
      case "case.linked": {
        // Two cases marked as related: both stay as they are (plan SEE, D17).
        const c = cases[target];
        const peerId = pl.to;
        const other = typeof peerId === "string" ? cases[peerId] : undefined;
        if (!c || !other || other === c || c.merged !== null || other.merged !== null || c.withdrawn !== null || c.links.includes(other.id)) break;
        c.links.push(other.id);
        other.links.push(c.id);
        c.history.push(ev);
        break;
      }
      case "case.asked": {
        const c = cases[target];
        if (!c || c.status !== "open") break;
        if (c.read === null) c.read = d;
        c.question = { text: pl.text ?? "", by: ev.actor, byUserId: uid, day: d, answer: null, unanswered: null };
        c.status = "asked";
        c.pausedSince = d;
        c.history.push(ev);
        break;
      }
      case "case.answered": {
        const c = cases[target];
        if (!c || c.status !== "asked" || !c.question) break;
        c.question.answer = { text: pl.text ?? "", by: ev.actor, byUserId: uid, day: d };
        c.pausedDays += d - (c.pausedSince ?? d);
        c.pausedSince = null;
        c.status = "open";
        c.history.push(ev);
        break;
      }
      case "case.withdrawn": {
        // Only the raiser, only before a decision (features/cases/permissions.ts); the clock stops with it.
        const c = cases[target];
        if (!c || c.fromUserId === null || uid !== c.fromUserId || c.decided || c.withdrawn) break;
        if (c.status !== "open" && c.status !== "discussion" && c.status !== "asked") break;
        if (c.pausedSince !== null) { c.pausedDays += d - c.pausedSince; c.pausedSince = null; }
        c.withdrawn = { day: d, by: ev.actor, byUserId: uid, note: (pl.note ?? "").trim().slice(0, 500) };
        c.status = "withdrawn";
        c.history.push(ev);
        break;
      }
      case "case.unanswered": {
        // The clock's own event (as its hand-overs, FX8): nobody else may end a question without an answer.
        const c = cases[target];
        if (!c || c.status !== "asked" || !c.question || !byClock(ev)) break;
        c.question.unanswered = d;
        c.pausedDays += d - (c.pausedSince ?? d);
        c.pausedSince = null;
        c.status = "open";
        c.history.push(ev);
        break;
      }
      case "case.building": {
        const c = cases[target];
        if (!c) break;
        c.building = { day: d, days: pl.days ?? 30, expected: pl.expected ?? "", by: ev.actor, byUserId: uid };
        c.status = "building";
        c.history.push(ev);
        break;
      }
      case "case.shipped": {
        const c = cases[target];
        if (!c) break;
        c.shipped = { day: d, outcome: pl.outcome ?? "", outcomeNote: pl.outcomeNote ?? "", by: ev.actor, byUserId: uid };
        c.status = "shipped";
        c.history.push(ev);
        break;
      }
      case "case.override": {
        const c = cases[target];
        if (!c || !pl.chosen) break;
        const chosen = routeOf(pl.chosen);
        c.override = { proposed: pl.proposed ?? c.routeId, chosen: pl.chosen, day: d, by: ev.actor, byUserId: uid };
        if (chosen) {
          c.routeId = chosen.id; c.assignee = chosen.owner.name;
          c.assigneeSeatId = chosen.ownerSeatId ?? null; c.assigneeRoleId = roleOfSeat(c.assigneeSeatId);
        }
        c.history.push(ev);
        break;
      }
      case "idea.cosigned": {
        const i = ideas[target];
        if (!i) break;
        // By user id; an event without one adds a co-signer nobody can remove again.
        if (uid === null || !i.cosigners.some((x) => x.userId === uid)) i.cosigners.push({ name: ev.actor, userId: uid, day: d });
        break;
      }
      case "idea.uncosigned": {
        const i = ideas[target];
        if (!i) break;
        if (uid !== null) i.cosigners = i.cosigners.filter((x) => x.userId !== uid);
        break;
      }
      case "idea.asked": {
        const i = ideas[target];
        if (!i) break;
        i.thread.push({ text: pl.text ?? "", by: ev.actor, byUserId: uid, day: d, answer: null });
        break;
      }
      case "idea.approved":
      case "idea.funded": {
        const i = ideas[target];
        if (!i) break;
        i.approved = { by: ev.actor, byUserId: uid, day: d, note: pl.note ?? "", funded: ev.type === "idea.funded" };
        i.status = "In trial";
        i.wait = 0;
        if (pl.team && pl.team.length) i.team = pl.team.slice();
        const p = problems[i.problem];
        if (p && p.owner !== "trial") p.owner = "trial";
        break;
      }
      case "clock.due": {
        // A fact the scheduler stored (CLK/D10). It stays in the case's history; the escalation reads it below.
        const c = cases[target];
        if (c) c.history.push(ev);
        break;
      }
      case "day.advanced":
        break; // the day is tracked on the log itself
      default:
        break;
    }
  };

  seedEvents.forEach(apply);
  log.events.forEach(apply);

  // Derived per case: age, clock, overdue, escalation, last action.
  const promise = seed.promiseDays || 5;
  order.forEach((id) => {
    const c = cases[id];
    const route = routeOf(c.routeId);
    c.route = route;
    c.age = day - c.raisedDay;
    const stopDay = c.decided ? c.decided.day : c.withdrawn ? c.withdrawn.day : c.merged ? c.merged.day : c.building ? c.building.day : c.shipped ? c.shipped.day : null;
    const paused = c.pausedDays + (c.pausedSince !== null ? day - c.pausedSince : 0);
    // The answer date and the clock count from the cycle's start: the raise day, until the case is reopened (D12).
    c.clock = Math.max(0, (stopDay !== null ? stopDay : day) - c.cycleStartDay - paused);
    c.open = c.status === "open" || c.status === "discussion";
    c.archived = c.status === "decided" || c.status === "withdrawn" || c.status === "merged";
    const talk = c.status === "discussion" ? c.discussion : null;
    if (talk) {
      // In a discussion the next check-in is what is due - or, once it said "decide", the decision.
      const last = talk.rounds[talk.rounds.length - 1];
      talk.round = talk.rounds.length + (talk.ready ? 0 : 1);
      talk.lastDay = talk.startedDay + rules.discussEveryDays * rules.discussMaxRounds;
      c.dueDay = (last ? last.day : talk.startedDay) + rules.discussEveryDays;
      c.overdue = day > c.dueDay;
    } else {
      c.dueDay = Math.max((cycleDue.get(c.id) ?? c.cycleStartDay + promise) + paused, c.dueFloor ?? -Infinity);
      // A pass that gave the new desk more time moves the date it is late on.
      c.overdue = c.open && (c.dueFloor === null && !cycleDue.has(c.id) ? c.clock > promise : day > c.dueDay);
    }
    // The route's owner takes it if the case sat with someone else, otherwise the owner's deputy.
    // The original owner keeps it too - both can act.
    // By role (D8): a case on the owner's role goes to the deputy, anything else to the owner.
    const atOwner = route !== null && c.assigneeRoleId !== null && c.assigneeRoleId === (route.ownerRoleId ?? null);
    const to = route ? (atOwner ? route.deputy : route.owner.name) : null;
    const toSeatId = route ? (atOwner ? route.deputySeatId ?? null : route.ownerSeatId ?? null) : null;
    const toRoleId = route ? (atOwner ? route.deputyRoleId ?? null : route.ownerRoleId ?? null) : null;
    if (!workdays) {
      c.escalated = c.overdue && to ? { to, from: c.assignee, day: c.dueDay + 1, live: c.dueDay + 1 >= 0, toSeatId, toRoleId } : null;
    } else {
      // Workdays (D11): only the latest stored deadline fact escalates, and only while the case is open.
      // Per cycle (D24): only the facts after the case's last reopen count.
      const cycle = cycleEvents(c);
      const fact = c.open ? [...cycle].reverse().find((e) => e.type === "clock.due" && e.payload.kind === "deadline") : undefined;
      const seat = fact ? seats.find((s) => s.id === fact.payload.toRoleHolderId) : undefined;
      // LOOP-R1 (D17): a deadline hand-over after the latest fact ends the escalation; the seat now holds the case.
      const handedAfter = fact !== undefined && cycle.indexOf(fact) < cycle.findLastIndex((e) => e.type === "case.handed" && e.payload.why === "deadline");
      c.escalated = fact && seat && !handedAfter
        ? { to: seat.label, from: c.assignee, day: (fact.payload.dueDay ?? c.dueDay) + 1, live: true, toSeatId: seat.id, toRoleId: seat.roleId }
        : null;
    }
  });

  const projects = finishProjects(book, { day, promise, rules, projectStartDays: rules.projectStartDays, routeOf, seats: seed.seats ?? [], workdays });

  const ledger: LedgerCounts = {
    handedOver: order.reduce((a, id) => a + cases[id].handed.length, 0),
    escalated: order.reduce((a, id) => a + (cases[id].escalated?.live ? 1 : 0), 0),
    overrides: order.reduce((a, id) => a + (cases[id].override ? 1 : 0), 0),
    projectsEscalated: projects.reduce((a, p) => a + (p.escalated?.live ? 1 : 0), 0),
    measuresOwed: projects.reduce((a, p) => a + p.checks.filter((k) => k.late).length, 0),
    unmeasured: projects.reduce((a, p) => a + (p.verdict === "not measured" ? 1 : 0), 0),
  };

  return {
    day,
    cases: order.map((id) => cases[id]),
    ideas: seed.ideas.map((i) => ideas[i.id]),
    problems: seed.problems.map((p) => problems[p.id]),
    projects,
    ledger,
    rules,
    seats: seed.seats ?? [],
    routes,
    clock,
    approvals: { ...(seed.approvals ?? EMPTY_APPROVAL_CONFIG), roles: (seed.roles ?? []).map((r) => ({ id: r.id, title: r.title ?? "", reportsToId: r.reportsToId, spendLimitEur: r.spendLimitEur ?? null })) },
  };
}

const uniq = (names: readonly string[]): string[] => [...new Set(names.map((n) => n.trim()).filter(Boolean))];
const uniqIds = (ids: readonly string[]): string[] => [...new Set(ids.filter(Boolean))];
