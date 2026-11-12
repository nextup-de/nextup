// Who may append which event. The server's copy of the rules the UI already follows: a button
// that is hidden in the browser is only a courtesy, appendEventAction runs this before it writes.
//
// Pure: state in, verdict out. The caller reduces the company's log first, so "is this your case"
// is answered against the same state everybody sees.
import { NOBODY, type Actor as IdentityActor } from "@/features/auth/identity";
import { isProjectId, mayAppendProject } from "@/features/projects/permissions";
import { isClockReason } from "@/features/clock/actor";
import { mayLink, mayMerge } from "./links";
import type { EventPayload } from "./events";
import type { State } from "./reducer";
import { onDeskOf } from "./selectors";
import { canOpen, unitsOf, type VisCtx } from "./visibility";
import { createT, DEFAULT_LOCALE, type Locale, type MessageKey, type T } from "@/i18n";
import {
  APPEAL_TEXT_MAX, APPEAL_TEXT_MIN, appealOpen, CHANGE_IF_MAX, mayAnswerAppeal, NO_CATEGORIES, NOT_NOW_MAX_IN_ROW, PASS_LIMIT, PASS_REASON_MIN, passDueDay,
  REASON_MAX, REVISIT_MAX_AHEAD, revisitAllowed, revisitRequired,
} from "./no";

// The identity Actor (features/auth/identity.ts). `userId` and `me` are optional so a caller that has only a
// name and a handle keeps compiling; without them the actor is nobody and holds no desk.
export type Actor = Pick<IdentityActor, "role" | "name" | "handle"> & Partial<Pick<IdentityActor, "userId" | "me">>;
export type Verdict = { ok: true } | { ok: false; error: string };

const OK: Verdict = { ok: true };
const no = (t: T, key: MessageKey, params?: Record<string, string | number>): Verdict => ({ ok: false, error: t(key, params) });

/** The discussion's last day has passed: nothing is added to it any more (plan NOR, D19). */
const afterLastDay = (c: State["cases"][number], state: State): boolean =>
  c.status === "discussion" && c.discussion !== null && c.discussion.lastDay > 0 && state.day > c.discussion.lastDay;

/** Events on a case that only the person holding it (or a manager) may send. */
const DESK_EVENTS = new Set(["case.read", "case.decided", "case.handed", "case.asked"]);
/** Anyone who may open the case may add these to it (FX4). */
const OPEN_CASE_EVENTS = new Set(["case.affected", "case.unaffected", "case.commented"]);
/** Does this event need `access`, the part of the visibility rule that is not in the state? A merge and a link name a second case the person must be able to open. */
export const needsCaseAccess = (type: string): boolean => OPEN_CASE_EVENTS.has(type) || type === "case.merged" || type === "case.linked";
const OPEN_IDEA_EVENTS = new Set(["idea.cosigned", "idea.uncosigned", "idea.asked"]);

export function mayAppend(
  actor: Actor,
  ev: { type: string; target: string | null; payload: Readonly<Record<string, unknown>> },
  state: State,
  locale: Locale = DEFAULT_LOCALE,
  access: Pick<VisCtx, "roles" | "members"> = { roles: [] },
): Verdict {
  const t = createT(locale);
  const isManager = actor.role === "manager";
  const kase = ev.target ? state.cases.find((c) => c.id === ev.target) : undefined;
  const idea = ev.target ? state.ideas.find((i) => i.id === ev.target) : undefined;
  const me = actor.me ?? NOBODY;
  const userId = actor.userId ?? me.userId;
  const onMyDesk = (c: State["cases"][number]) => onDeskOf(c, me);
  const isRaiser = (c: State["cases"][number]) => c.fromUserId !== null && c.fromUserId === userId;

  // A merged case is closed (plan SEE, D17, D23): nobody adds to it. The clock writes without mayAppend; this is every person's event.
  if (kase && kase.status === "merged" && ev.type.startsWith("case.") && ev.type !== "case.raised") return no(t, "cases.permMerged");

  switch (true) {
    case ev.type === "case.raised":
      // A second case.raised on an existing id would rebuild that case and drop its history.
      if (!ev.target) return no(t, "cases.permNeedsId");
      return kase || idea ? no(t, "cases.permCaseExists") : OK;

    case DESK_EVENTS.has(ev.type): {
      if (!kase) return no(t, "cases.permNoCase");
      if (!(isManager || onMyDesk(kase))) return no(t, "cases.permDeskOnly");
      if (ev.type === "case.handed") {
        const seat = (ev.payload as EventPayload).toRoleHolderId;
        if (typeof seat !== "string" || !state.seats.some((s) => s.id === seat)) return no(t, "cases.permHandSeat");
        // FX8: "deadline" and "escalation" are the clock's reasons. The clock never comes through here.
        if (isClockReason(ev.payload.why)) return no(t, "cases.permHandReason");
        const pass = mayPass(ev.payload as EventPayload, kase, state, t, me, isManager);
        if (!pass.ok) return pass;
      }
      // A question on a decided case would put it back to "asked" and hide the decision (K3).
      if (ev.type === "case.asked" && kase.decided) return no(t, "cases.permAlreadyDecided");
      return ev.type === "case.decided" ? mayDecide(ev.payload as EventPayload, kase, state, t, userId) : OK;
    }

    // The discussion stage (docs/plans/2026-10-15_idea-to-project.md).
    case ev.type === "case.discussion":
      if (!kase) return no(t, "cases.permNoCase");
      if (!(isManager || onMyDesk(kase))) return no(t, "cases.permDeskDiscussion");
      return kase.status === "open" ? OK : no(t, "cases.permOpenForDiscussion");

    case ev.type === "case.invited":
    case ev.type === "case.checkin": {
      if (!kase) return no(t, "cases.permNoCase");
      if (!(isManager || onMyDesk(kase))) return no(t, "cases.permDeskOnly");
      if (kase.status !== "discussion" || !kase.discussion || kase.discussion.ready) return no(t, "cases.permNotInDiscussion");
      if (afterLastDay(kase, state)) return no(t, "cases.permLastDay");
      if (ev.type === "case.invited") return Array.isArray(ev.payload.invited) && ev.payload.invited.length > 0 ? OK : no(t, "cases.permInviteWhom");
      // The last allowed round ends in a decision; going on needs a manager.
      const lastRound = kase.discussion.rounds.length + 1 >= state.rules.discussMaxRounds;
      return ev.payload.next === "round" && lastRound && !isManager ? no(t, "cases.permLastRound") : OK;
    }

    case ev.type === "case.withdrawn": {
      // Decision Q1.14: the raiser, while nobody has decided; one optional line why. After a yes only the project stops.
      if (!kase) return no(t, "cases.permNoCase");
      if (!isRaiser(kase)) return no(t, "cases.permWithdrawOwner");
      if (kase.decided || kase.withdrawn || (kase.status !== "open" && kase.status !== "discussion" && kase.status !== "asked")) return no(t, "cases.permIdeaDecided");
      const note = ev.payload.note;
      return note === undefined || (typeof note === "string" && note.length <= 500) ? OK : no(t, "cases.permWithdrawNote");
    }

    case ev.type === "case.revised":
      if (!kase) return no(t, "cases.permNoCase");
      if (!isRaiser(kase)) return no(t, "cases.permReviseOwner");
      if (kase.decided) return no(t, "cases.permIdeaDecided");
      if (afterLastDay(kase, state)) return no(t, "cases.permLastDay");
      return typeof ev.payload.body === "string" && ev.payload.body.trim() ? OK : no(t, "cases.permReviseText");

    case ev.type.startsWith("project."):
      return mayAppendProject(actor, { type: ev.type, target: ev.target, payload: ev.payload as EventPayload }, state);

    case ev.type === "case.answered":
      if (!kase) return no(t, "cases.permNoCase");
      return isRaiser(kase) ? OK : no(t, "cases.permAnswerOwner");

    case ev.type === "case.override":
      if (!kase) return no(t, "cases.permNoCase");
      if (!isManager) return no(t, "cases.permOverrideManager");
      // Move to a desk (D21): an open or asked case, to a route the company has.
      if (kase.status !== "open" && kase.status !== "asked") return no(t, "cases.permOverrideOpen");
      return typeof ev.payload.chosen === "string" && state.routes.some((r) => r.id === ev.payload.chosen) ? OK : no(t, "cases.permOverrideRoute");

    case ev.type === "case.merged":
    case ev.type === "case.linked": {
      // A duplicate is closed into another case, or two cases are marked as related (D17): the desk's holders, the escalated role and
      // managers. The other case comes from the state; the server adds it only when the person may open it (append/case.ts), so a case
      // that is private to them, foreign or unknown is the same missing case here.
      if (!kase) return no(t, "cases.permNoCase");
      if (!(isManager || onMyDesk(kase))) return no(t, "cases.permDeskOnly");
      const other = ev.payload[ev.type === "case.merged" ? "into" : "to"];
      const target = typeof other === "string" ? state.cases.find((c) => c.id === other) ?? null : null;
      const who = { ...me, userId };
      if (ev.type === "case.merged") {
        if (ev.payload.note !== undefined && typeof ev.payload.note !== "string") return no(t, "cases.permMergeNote");
        return mayMerge(kase, target, who, isManager) ? OK : no(t, "cases.permMerge");
      }
      return mayLink(kase, target, who, isManager) ? OK : no(t, "cases.permLink");
    }

    case ev.type === "case.appealed": {
      // The second look (D18): the raiser, once, within appeal_days of the latest no.
      if (!kase) return no(t, "cases.permNoCase");
      if (!isRaiser(kase)) return no(t, "cases.permAppealWho");
      if (kase.appeal !== null) return no(t, "cases.permAppealOnce");
      if (kase.decided?.answer !== "no" || !appealOpen(kase, state.day, state.rules.appealDays)) return no(t, "cases.permAppealClosed", { n: state.rules.appealDays });
      const text = typeof ev.payload.text === "string" ? ev.payload.text.trim() : "";
      return text.length >= APPEAL_TEXT_MIN && text.length <= APPEAL_TEXT_MAX ? OK : no(t, "cases.permAppealText", { min: APPEAL_TEXT_MIN, max: APPEAL_TEXT_MAX });
    }

    case ev.type === "case.appeal.decided": {
      if (!kase) return no(t, "cases.permNoCase");
      if (kase.appeal === null || kase.appeal.decided !== null) return no(t, "cases.permAppealNone");
      // Only the desk the second look went to, the seat a later escalation names, or a manager: never the person who said no.
      if (!mayAnswerAppeal(kase, { ...me, userId }, isManager, state.seats)) return no(t, "cases.permAppealAnswerWho");
      if (typeof ev.payload.uphold !== "boolean") return no(t, "cases.permAppealUphold");
      const reason = typeof ev.payload.reason === "string" ? ev.payload.reason.trim() : "";
      return reason.length >= state.rules.noReasonMin && reason.length <= REASON_MAX ? OK : no(t, "cases.permNoReasonShort", { n: state.rules.noReasonMin });
    }

    case ev.type === "case.reopened": {
      // A no that comes back on its date is the clock's (it writes without mayAppend); a person only sends a stopped project's idea back (D16).
      if (!kase) return no(t, "cases.permNoCase");
      if (ev.payload.why !== "stopped") return no(t, "cases.permReopenWhy");
      const project = state.projects.find((p) => p.status === "stopped" && p.sources.includes(kase.id));
      if (!project || kase.status !== "decided" || kase.decided?.answer !== "yes" || kase.decided.projectId !== project.id) return no(t, "cases.permReopenStopped");
      const stop = project.history.find((e) => e.type === "project.stopped");
      return isManager || (userId !== null && stop?.actorUserId === userId) ? OK : no(t, "cases.permReopenWho");
    }

    case ev.type === "case.invite.declined": {
      // An invited person says the discussion is not for them (D14): once, while it runs, with at most one line why.
      if (!kase) return no(t, "cases.permNoCase");
      const talk = kase.discussion;
      if (kase.status !== "discussion" || !talk || userId === null || !talk.invitedUserIds.includes(userId)) return no(t, "cases.permDeclineWho");
      if (talk.declinedUserIds.includes(userId)) return no(t, "cases.permDeclineOnce");
      const why = ev.payload.why;
      return why === undefined || (typeof why === "string" && why.length <= 300) ? OK : no(t, "cases.permDeclineWhy");
    }

    case OPEN_CASE_EVENTS.has(ev.type): {
      // The same answer as for no such case: a refusal must not say that a private case exists.
      if (!kase) return no(t, "cases.permNoCase");
      const viewer = { ...me, userId };
      const ctx = { seats: state.seats, projects: state.projects, ...access };
      if (!canOpen(kase, { me: viewer, role: actor.role, unitIds: unitsOf(viewer, access) }, ctx)) return no(t, "cases.permNoCase");
      return ev.type === "case.commented" && afterLastDay(kase, state) ? no(t, "cases.permLastDay") : OK;
    }

    case OPEN_IDEA_EVENTS.has(ev.type):
      return idea ? OK : no(t, "cases.permNoIdea");

    case ev.type === "idea.approved" || ev.type === "idea.funded":
      if (!idea) return no(t, "cases.permNoIdea");
      return actor.role === "member" ? no(t, "cases.permApproveRole") : OK;

    case ev.type === "day.advanced": {
      if (!isManager) return no(t, "cases.permClockManager");
      const by = ev.payload.by ?? 1;
      return typeof by === "number" && Number.isInteger(by) && by >= 1 && by <= 30 ? OK : no(t, "cases.permClockRange");
    }

    default:
      return no(t, "cases.permNotAllowed");
  }
}

/**
 * One decision per case (K3): a second one, from the app, the API or a card still open in Teams, would replace the
 * first in the reducer. A yes that names a project opens it, or joins one that is still open.
 */
function mayDecide(pl: EventPayload, kase: State["cases"][number], state: State, t: T, userId: string | null): Verdict {
  // Decided in the current cycle: a case that was reopened (a no that came back, a second look, a stopped project) has no decision until the next (D12).
  if (kase.decided) return no(t, "cases.permAlreadyDecided");
  if (pl.answer === "no") {
    const reasoned = mayNo(pl, kase, state, t);
    if (!reasoned.ok) return reasoned;
  }
  // Plan SET (D8, D10): a yes may open a draft and carry one line to the raiser; a yes without `draft` keeps its rules.
  if (pl.draft !== undefined && typeof pl.draft !== "boolean") return no(t, "cases.permDraftFlag");
  if (pl.raiserNote !== undefined && !(typeof pl.raiserNote === "string" && pl.raiserNote.length <= 300)) return no(t, "cases.permRaiserNote");
  if (pl.draft === true && pl.projectId === undefined) return no(t, "cases.permDraftNeedsProject");
  if (pl.projectId === undefined) return OK;
  if (pl.answer !== "yes") return no(t, "cases.permYesOpensProject");
  if (!isProjectId(pl.projectId)) return no(t, "cases.permProjectId");
  if (typeof pl.lead !== "string" || !pl.lead.trim() || pl.lead.length > 120) return no(t, "cases.permProjectLead");
  const project = state.projects.find((p) => p.id === pl.projectId);
  if (project && (project.status === "stopped" || project.status === "recognised")) return no(t, "cases.permProjectClosed");
  // A draft joins an open project only when the decider leads it or is on its team (D10).
  if (pl.draft === true && project && !(userId !== null && (project.leadUserId === userId || project.memberUserIds.includes(userId)))) return no(t, "cases.permDraftJoinWho");
  return OK;
}

/**
 * The no of plan NOR (D17): a category, a reason of the company's fewest characters, what would make it a yes, the day it comes back
 * and, for Already solved or in work, the case or project that covers it. Written by a person, on the app and the Teams card alike.
 * That the link exists and the person may open it is checked at the server's boundary (server/actions/append/case.ts), which has
 * the database: this reduced state holds only a slice of the log.
 */
function mayNo(pl: EventPayload, kase: State["cases"][number], state: State, t: T): Verdict {
  const category = pl.category;
  if (typeof category !== "string" || !(NO_CATEGORIES as readonly string[]).includes(category)) return no(t, "cases.permNoCategory");
  const min = state.rules.noReasonMin;
  const reason = typeof pl.reason === "string" ? pl.reason.trim() : "";
  if (reason.length < min) return no(t, "cases.permNoReasonShort", { n: min });
  if (typeof pl.reason === "string" && pl.reason.length > REASON_MAX) return no(t, "cases.permNoReasonLong", { n: REASON_MAX });
  if (pl.changeIf !== undefined && !(typeof pl.changeIf === "string" && pl.changeIf.length <= CHANGE_IF_MAX)) return no(t, "cases.permChangeIf", { n: CHANGE_IF_MAX });
  const day = pl.revisitDay;
  if (day !== undefined) {
    if (!revisitAllowed(category as (typeof NO_CATEGORIES)[number])) return no(t, "cases.permRevisitNotAllowed");
    if (!(typeof day === "number" && Number.isInteger(day) && day > state.day && day <= state.day + REVISIT_MAX_AHEAD)) return no(t, "cases.permRevisitRange", { n: REVISIT_MAX_AHEAD });
  } else if (revisitRequired(category as (typeof NO_CATEGORIES)[number])) return no(t, "cases.permRevisitNeeded");
  if (category === "not-now" && kase.notNowInRow >= NOT_NOW_MAX_IN_ROW) return no(t, "cases.permNotNowLimit", { n: NOT_NOW_MAX_IN_ROW });
  if (category === "duplicate") {
    const link = pl.duplicateOf;
    if (!(typeof link === "string" && link.length >= 1 && link.length <= 64) || link === kase.id) return no(t, "cases.permDuplicateTarget");
  } else if (pl.duplicateOf !== undefined) return no(t, "cases.permDuplicateNotAllowed");
  return OK;
}

/**
 * A person's pass (D13). Every pass needs a why of PASS_REASON_MIN characters. An asked case is passed only with the flag that keeps
 * its question. Not mine goes back, once, to the seat the case came from, and only for a holder of the seat the last pass reached. After
 * PASS_LIMIT passes by people a non-manager may only send up; a manager passes freely. A route that comes with it belongs to the seat
 * it goes to, and the new desk's date floor is the one the rule computes, never another.
 */
function mayPass(pl: EventPayload, kase: State["cases"][number], state: State, t: T, me: { seatIds: readonly string[] }, isManager: boolean): Verdict {
  if (typeof pl.why !== "string" || pl.why.trim().length < PASS_REASON_MIN) return no(t, "cases.permPassWhy", { n: PASS_REASON_MIN });
  // Q4.21: the reducer moves a case while it is open or in a discussion, and an asked one only when its question stays open.
  if (kase.status === "asked") {
    if (pl.keepsQuestion !== true) return no(t, "cases.permHandAsked");
  } else if (kase.status !== "open" && kase.status !== "discussion") return no(t, "cases.permHandNotOpen");
  const seat = pl.toRoleHolderId;
  if (pl.back === true && pl.up === true) return no(t, "cases.permPassBackUp");
  if (pl.back === true) {
    const last = kase.handed[kase.handed.length - 1];
    const mine = last !== undefined && last.toSeatId !== null && me.seatIds.includes(last.toSeatId);
    if (!last || last.back || last.fromSeatId === null || !mine || seat !== last.fromSeatId) return no(t, "cases.permPassNotMine");
  }
  if (!isManager && kase.passes >= PASS_LIMIT && pl.up !== true) return no(t, "cases.permPassLimit", { n: PASS_LIMIT });
  if (pl.routeId !== undefined) {
    const route = typeof pl.routeId === "string" ? state.routes.find((r) => r.id === pl.routeId) : undefined;
    if (!route || (route.ownerSeatId !== seat && route.deputySeatId !== seat)) return no(t, "cases.permPassRoute");
  }
  if (pl.dueDay !== undefined && pl.dueDay !== passDueDay(kase, state.day)) return no(t, "cases.permPassDue");
  return OK;
}
