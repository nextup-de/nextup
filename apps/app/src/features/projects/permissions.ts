// Who may append which project.* event - the server's copy of the rules the project pages follow
// (docs/plans/2026-10-15_idea-to-project.md, "New events"). Called from features/cases/permissions.ts.
// Pure: the reduced state in, a verdict out.
import type { Actor, Verdict } from "@/features/cases/permissions";
import type { EventPayload } from "@/features/cases/events";
import type { State } from "@/features/cases/reducer";
import { translate, DEFAULT_LOCALE, type Locale, type MessageKey } from "@/i18n";
import { holdsRole, seatsOfRole, type Me } from "@/features/auth/identity";
import type { Route } from "@/features/demo/types";
import { unmetApprovals } from "@/features/approvals/rights";
import { stepLabel } from "@/features/approvals/steps";
import { byClock } from "@/features/clock/actor";
import { PAUSE_MAX_DAYS } from "@/features/clock/kinds/project";
import { TEMPLATES } from "@/features/templates/library";
import { mayConfirm, unconfirmedOf } from "./confirm";
import { baselineNeedsConfirm, DROP_WHY_MAX, HELP_TEXT_MAX, openStepsOf, QUESTION_WHY_MAX, revisionMatches } from "./result";
import { isMeasureSource, readImpact } from "./measure-source";
import { checkInDayOf, previousCheckInDayOf } from "./rhythm";
import { STEP_COLUMNS, SYNC_SYSTEMS, type InviteRole, type ReducedProject } from "./types";

const OK: Verdict = { ok: true };

const text = (v: unknown, max = 2000): v is string => typeof v === "string" && v.trim().length > 0 && v.length <= max;
// A link ends up as <a href> on the board: only http(s), never javascript: or data: (same rule as the
// connectors' allow-list, features/integrations).
const webUrl = (v: unknown): v is string => typeof v === "string" && v.length <= 1000 && /^https?:\/\/\S+$/i.test(v);
const ID = /^[A-Za-z0-9_-]{1,64}$/;
/** The columns a new step may start in: Blocked needs its reason, so a step only moves there. */
const STARTS: readonly string[] = ["todo", "doing", "done"];

const INVITE_ROLES: readonly InviteRole[] = ["sponsor", "member", "contributor", "follower"];
/** A line of `min` to `max` characters once trimmed (the goal and its done-when, D17). */
const lineOf = (v: unknown, min: number, max: number): v is string => typeof v === "string" && v.trim().length >= min && v.length <= max;
const templateExists = (key: unknown, version: unknown): boolean =>
  typeof key === "string" && Object.prototype.hasOwnProperty.call(TEMPLATES, key) && Number.isInteger(version) &&
  TEMPLATES[key as keyof typeof TEMPLATES].some((t) => t.version === version);

/** Ids a client mints for a project or a step (features/cases/events newId). */
export const isProjectId = (v: unknown): v is string => typeof v === "string" && ID.test(v);

/** True only for the accepted sponsor of the project (plan MOV, D13); nobody when it has none. */
export function isSponsor(p: Pick<ReducedProject, "sponsorUserId">, userId: string | null): boolean {
  return userId !== null && p.sponsorUserId === userId;
}

/**
 * The check-in day an update may be for: the latest check-in of the project that has arrived (D21). The current week's when its
 * day is today or past, else the nearest earlier week's; null before the start or when there is none.
 */
function dueCheckInDay(p: ReducedProject, state: State): number | null {
  const current = checkInDayOf(p, state.day, state.clock);
  if (current === null) return null;
  return current <= state.day ? current : previousCheckInDayOf(p, current, state.clock);
}

/**
 * Who may name a new lead for a project that has none (D14, D31): its accepted sponsor (a sponsor who leads it counts as none, D26),
 * a holder of the route's owner or deputy role (the desk that said yes), the decider, a manager, and the holder of the seat the
 * vacant fact (clock.due kind vacant, written after the lead left) escalated to. The project.lead.changed rule and the inbox item
 * both ask here, so no one is shown an action they cannot append.
 */
export function mayNameLead(p: ReducedProject, route: Route | null | undefined, who: { userId: string | null; me?: Me; manager: boolean }): boolean {
  if (p.leadVacatedDay === null) return false;
  if (who.manager) return true;
  const holds = (roleId: string | null) => who.me !== undefined && holdsRole(who.me, roleId);
  if (who.userId !== null && (p.deciderUserId === who.userId || (p.sponsorUserId === who.userId && p.sponsorUserId !== p.leadUserId))) return true;
  if (route && (holds(route.ownerRoleId ?? null) || holds(route.deputyRoleId ?? null))) return true;
  // The seat of the vacant fact that belongs to this vacancy: the latest one after the lead left.
  const left = p.history.findLastIndex((e) => e.type === "project.lead.vacated");
  const fact = p.history.findLast((e, i) => i > left && e.type === "clock.due" && e.payload.kind === "vacant");
  const seatId = fact?.payload.toRoleHolderId ?? null;
  return seatId !== null && who.me !== undefined && who.me.seatIds.includes(seatId);
}

export function mayAppendProject(actor: Actor, ev: { type: string; target: string | null; payload: EventPayload }, state: State, locale: Locale = DEFAULT_LOCALE): Verdict {
  const no = (key: MessageKey, params?: Record<string, string | number>): Verdict => ({ ok: false, error: translate(locale, key, params) });
  const p = ev.target ? state.projects.find((x) => x.id === ev.target) : undefined;
  if (!p) return no("projects.permNoProject");
  const pl = ev.payload;
  const isManager = actor.role === "manager";
  // Who someone is: the user id, never the label (IDN/D2).
  const uid = actor.userId ?? null;
  const isMe = (who: string | null) => uid !== null && who === uid;
  const isLead = isMe(p.leadUserId) || isManager;
  const live = p.status !== "stopped" && p.status !== "recognised";
  // The project draft (plan SET): a project a yes with draft: true opened. A legacy project keeps today's rules below.
  const draft = p.draft;
  const planning = p.status === "planning";
  // The decider sets the draft up until the lead has taken it (D17); then it is the lead's.
  const decider = draft && p.leadState === "pending" && isMe(p.deciderUserId);
  const onTeam = isLead || p.memberUserIds.some(isMe) || decider;
  // The seat holder the draft was escalated to may keep, hand on or stop it while the escalation is live (D15).
  const escalatedSeat = draft && planning && p.escalated !== null && p.escalated.what === "draft" && p.escalated.live ? p.escalated.toSeatId : null;
  const escalatedHolder = escalatedSeat !== null && isMe(state.seats.find((s) => s.id === escalatedSeat)?.userId ?? null);
  const clock = byClock({ actor: actor.name, actorUserId: uid });
  // A project that keeps moving (plan MOV). A sponsor who is also the lead counts as no sponsor (D26); a stalled escalation
  // that stands gives its seat's role the sponsor's rights (D13).
  const sponsor = isSponsor(p, uid) && p.sponsorUserId !== p.leadUserId;
  const holds = (roleId: string | null) => actor.me !== undefined && holdsRole(actor.me, roleId);
  const upSeat = p.escalated !== null && p.escalated.what === "stalled" && p.escalated.live && holds(p.escalated.toRoleId);
  const answers = isLead || sponsor || upSeat;
  const paused = p.pausedUntil !== null && state.day <= p.pausedUntil;
  const whole = (v: unknown): v is number => typeof v === "number" && Number.isInteger(v);

  switch (ev.type) {
    case "project.commented":
      // A draft in planning is read by the others; the raiser of its case may still comment (Q5.15, D20).
      if (draft && planning && !(onTeam || isMe(p.sponsorUserId) || p.followerUserIds.some(isMe) || p.authorUserIds.some(isMe))) return no("projects.permDraftCommentWho");
      return text(pl.text) ? OK : no("projects.permCommentText");

    case "project.lead.answered":
      if (!draft || !planning) return no("projects.permNotAllowed");
      if (p.leadState !== "pending") return no("projects.permLeadNotPending");
      if (pl.lapsed !== undefined && typeof pl.lapsed !== "boolean") return no("projects.permNotAllowed");
      // Nobody answered: only the clock writes that, and only as a decline (D11).
      if (pl.lapsed) return clock && pl.take === false ? OK : no("projects.permLapsedClock");
      if (!isMe(p.leadUserId)) return no("projects.permLeadAnswerWho");
      if (typeof pl.take !== "boolean") return no("projects.permTakeOrDecline");
      if (pl.take) return OK;
      return text(pl.reason, 500) ? OK : no("projects.permDeclineWhy");

    case "project.invited":
      if (!draft) return no("projects.permNotAllowed");
      if (!isLead) return no("projects.permInviteLead");
      if (!live) return no("projects.permClosed");
      if (typeof pl.userId !== "string" || pl.userId === "") return no("projects.permInviteWhom");
      if (!(INVITE_ROLES as readonly unknown[]).includes(pl.role)) return no("projects.permInviteRole");
      return pl.userId === p.leadUserId ? no("projects.permInviteLeadSelf") : OK;

    case "project.invite.answered": {
      if (!draft) return no("projects.permNotAllowed");
      if (!live) return no("projects.permClosed");
      // The answer names the invitation (G1's inviteId): the person invited, once, while it is pending.
      const invite = typeof pl.inviteId === "string" ? p.invites.find((i) => i.id === pl.inviteId) : undefined;
      if (!invite) return no("projects.permNoInvite");
      if (invite.state !== "pending") return no("projects.permInviteDone");
      if (pl.userId !== undefined && pl.userId !== invite.userId) return no("projects.permInviteAnswerWho");
      if (pl.lapsed !== undefined && typeof pl.lapsed !== "boolean") return no("projects.permNotAllowed");
      if (pl.lapsed) return clock && pl.take === false ? OK : no("projects.permLapsedClock");
      if (!isMe(invite.userId)) return no("projects.permInviteAnswerWho");
      return typeof pl.take === "boolean" ? OK : no("projects.permTakeOrDecline");
    }

    case "project.template":
      if (!draft) return no("projects.permNotAllowed");
      if (!planning || p.startedDay !== null) return no("projects.permTemplateAfterStart");
      if (!(isLead || decider)) return no("projects.permDraftSetupWho");
      if (!templateExists(pl.key, pl.version)) return no("projects.permTemplateUnknown");
      return pl.title === undefined || text(pl.title, 200) ? OK : no("projects.permTemplateTitle");

    case "project.goal": {
      if (!draft) return no("projects.permNotAllowed");
      if (!live) return no("projects.permClosed");
      if (!(isLead || decider || isMe(p.sponsorUserId))) return no("projects.permGoalWho");
      if (!lineOf(pl.goal, 3, 400)) return no("projects.permGoalText");
      if (!lineOf(pl.doneWhen, 3, 400)) return no("projects.permDoneWhenText");
      if (pl.doneBy !== undefined && !(typeof pl.doneBy === "number" && Number.isInteger(pl.doneBy) && pl.doneBy > state.day)) return no("projects.permDoneByDay");
      return pl.brief === undefined || (typeof pl.brief === "string" && pl.brief.length <= 1200) ? OK : no("projects.permBriefLong");
    }

    case "project.start.moved":
      if (!draft || !planning) return no("projects.permNotAllowed");
      if (!(isManager || escalatedHolder)) return no("projects.permStartMovedWho");
      if (!(typeof pl.dueDay === "number" && Number.isInteger(pl.dueDay) && pl.dueDay > state.day)) return no("projects.permStartMovedDay");
      return text(pl.why) ? OK : no("projects.permStartMovedWhy");

    case "project.member":
      if (!isLead) return no("projects.permLeadOnly");
      return typeof pl.userId === "string" && pl.userId !== "" ? OK : no("projects.permMemberWhom");

    case "project.handed":
      if (!(answers || escalatedHolder)) return no("projectMove.permSponsorOrLead");
      if (!live) return no("projects.permClosed");
      return typeof pl.toUserId === "string" && pl.toUserId !== "" ? OK : no("projects.permHandWhom");

    case "project.baseline":
      if (!(isLead || decider)) return no("projects.permLeadOnly");
      if (p.status !== "planning") return no("projects.permBaselineBeforeStart");
      if (pl.none) return text(pl.why) ? OK : no("projects.permBaselineWhy");
      if (!text(pl.metric, 200) || typeof pl.value !== "number" || !Number.isFinite(pl.value)) return no("projects.permBaselineWhat");
      return pl.better === "up" || pl.better === "down" ? OK : no("projects.permBaselineBetter");

    case "project.started":
      if (!isLead) return no("projects.permLeadOnly");
      if (p.status !== "planning") return no("projects.permAlreadyStarted");
      // A draft starts only once the lead has taken it, the goal is set and the baseline is taken (D17).
      if (draft && p.leadState === "pending") return no("projects.permStartLeadPending");
      if (draft && !p.goal) return no("projects.permStartNeedsGoal");
      // Approvals (plan GAT, D21, D33): the draft waits for its run, and the requirements are recomputed now - a higher cost, a changed limit, a new rule
      // or a refused supplement leave a step unmet, and a rule that names a role or council that is gone cannot be met by anyone.
      if (p.waitsForApproval ?? false) return no("approvals.permStartWaits");
      const opener = state.cases.find((c) => c.decided?.answer === "yes" && c.decided.projectId === p.id);
      if (opener) {
        const { missing, broken } = unmetApprovals(opener, state);
        const first = broken[0];
        if (first) return no("approvals.approverMissing", { rule: first.id });
        if (missing.length > 0) {
          const names = missing.map((m) => stepLabel(m, state.approvals, state.approvals.roles).name).filter(Boolean).join(", ");
          const verdict = no("approvals.permStartNewApproval");
          return names && !verdict.ok ? { ok: false, error: `${verdict.error} ${names}` } : verdict;
        }
      }
      if (!p.baseline) return no("projects.permStartNeedsBaseline");
      // Where a reward is possible a number baseline waits for a second person first (plan RES, D16).
      return baselineNeedsConfirm(p, state.rules) ? no("projectResult.permStartNeedsConfirm") : OK;

    case "project.step.added":
      if (!onTeam) return no("projects.permStepTeamAdd");
      if (!live) return no("projects.permClosed");
      if (!isProjectId(pl.stepId) || p.steps.some((s) => s.id === pl.stepId)) return no("projects.permStepIdUnusable");
      if (pl.to !== undefined && !(typeof pl.to === "string" && STARTS.includes(pl.to))) return no("projects.permStepStart");
      if (pl.note !== undefined && (typeof pl.note !== "string" || pl.note.length > 2000)) return no("projects.permDetailsLong");
      return text(pl.text, 500) ? OK : no("projects.permStepText");

    case "project.step.moved": {
      const step = p.steps.find((s) => s.id === pl.stepId);
      if (!step) return no("projects.permNoStep");
      // An unowned step is the team's: anyone on it may pick it up and move it.
      if (!(isLead || isMe(step.ownerUserId ?? null) || ((step.ownerUserId ?? null) === null && onTeam))) return no("projects.permStepMoveOwner");
      if (pl.before != null && !p.steps.some((s) => s.id === pl.before)) return no("projects.permNoStepAbove");
      // F5 (D18): a step goes to Blocked with its reason, whoever moves it.
      const column = pl.to;
      if (column === "blocked" && !text(pl.why, 400)) return no("projectMove.permBlockedWhy");
      return typeof pl.to === "string" && (STEP_COLUMNS as readonly string[]).includes(pl.to) ? OK : no("projects.permMoveWhere");
    }

    case "project.step.edited": {
      const step = p.steps.find((s) => s.id === pl.stepId);
      if (!step) return no("projects.permNoStep");
      if (!onTeam) return no("projects.permStepTeamChange");
      if (!live) return no("projects.permClosed");
      if (pl.removed) return isLead || isMe(step.byUserId ?? null) ? OK : no("projects.permStepRemove");
      if (pl.text !== undefined && !text(pl.text, 500)) return no("projects.permStepText");
      if (pl.owner !== undefined && !(typeof pl.owner === "string" && pl.owner.length <= 120)) return no("projects.permStepOwnerWho");
      if (pl.ownerUserId !== undefined && pl.ownerUserId !== null && typeof pl.ownerUserId !== "string") return no("projects.permStepOwnerWho");
      if (pl.dueDay !== undefined && pl.dueDay !== null && !(typeof pl.dueDay === "number" && Number.isFinite(pl.dueDay))) return no("projects.permStepDue");
      if (pl.note !== undefined && (typeof pl.note !== "string" || pl.note.length > 2000)) return no("projects.permDetailsLong");
      return OK;
    }

    case "project.linked":
      if (!isLead) return no("projects.permLeadOnly");
      if (pl.url !== undefined && pl.url !== "" && !webUrl(pl.url)) return no("projects.permLinkHttp");
      return webUrl(pl.url) || text(pl.key, 100) ? OK : no("projects.permLinkNeeds");

    case "project.sync":
      if (!isLead) return no("projects.permLeadOnly");
      if (!live) return no("projects.permClosed");
      if (!(SYNC_SYSTEMS as readonly unknown[]).includes(pl.system)) return no("projects.permSyncWhat", { systems: SYNC_SYSTEMS.join(", ") });
      return typeof pl.on === "boolean" ? OK : no("projects.permSyncOnOff");

    case "project.done": {
      if (!isLead) return no("projects.permLeadOnly");
      if (p.status !== "running") return no("projects.permOnlyRunningDone");
      // Every step not in Done is finished or dropped on the Done sheet (plan RES, D13): each listed once, none unknown. A step that
      // appeared after the sheet loaded is missing from the list, so a stale payload is refused.
      const open = openStepsOf(p);
      const listed = pl.openSteps;
      if (listed === undefined && open.length === 0) return OK;
      if (!Array.isArray(listed)) return no("projectResult.permDoneOpenSteps");
      const ids = listed.map((x) => (x !== null && typeof x === "object" ? x.stepId : undefined));
      if (ids.length !== open.length || new Set(ids).size !== ids.length || !open.every((x) => ids.includes(x.id))) return no("projectResult.permDoneOpenSteps");
      for (const x of listed) {
        if (x.end !== "done" && x.end !== "dropped") return no("projectResult.permDoneOpenSteps");
        if (x.end === "dropped" && !text(x.why, DROP_WHY_MAX)) return no("projectResult.permDropWhy");
      }
      return OK;
    }

    case "project.measured": {
      if (!isLead) return no("projects.permLeadOnly");
      const check = p.checks.find((c) => c.check === pl.check);
      if (!check) return no("projects.permNoCheck");
      // A sent-back check may be entered once more (plan RES, D14), for the revision that was sent back; any other recorded check is closed.
      const sentBack = p.measures.find((m) => m.check === check.check && m.sentBack && !m.reentered);
      if (sentBack && !revisionMatches(pl.measureEventId, sentBack.eventId)) return no("projectResult.permReenterOnce");
      if (check.measured && !sentBack) return no(p.measures.some((m) => m.check === check.check && m.reentered) ? "projectResult.permReenterOnce" : "projects.permCheckRecorded");
      if (state.day < check.opensDay) return no("projects.permCheckOpens");
      if (!(typeof pl.value === "number" && Number.isFinite(pl.value))) return no("projects.permMeasureNumber");
      // A string is an old-style typed source; an object must be valid and never a client-made system source.
      if (pl.source !== undefined && typeof pl.source !== "string") {
        if (!isMeasureSource(pl.source)) return no("projects.permMeasureSource");
        if (pl.source.kind === "system") return no("projects.permMeasureSystem");
      }
      if (pl.impact !== undefined && readImpact(pl.impact) === null) return no("projects.permMeasureImpact");
      return OK;
    }

    case "project.measure.confirmed": {
      const m = p.measures.find((x) => x.check === pl.check);
      // A sent-back result waits for the lead, and a confirmation names the revision it saw: a replaced number is never confirmed by it (RES review).
      if (!m || m.confirmed || m.sourceKind === "system" || m.sentBack || !revisionMatches(pl.measureEventId, m.eventId)) return no("projects.permNothingToConfirm");
      if (isMe(p.leadUserId) || isMe(m.byUserId)) return no("projects.permConfirmSecondPerson");
      const deputyRoleId = state.routes.find((r) => r.id === p.routeId)?.deputyRoleId ?? null;
      // A stopped project waits for nobody (unconfirmedOf), but its number can still be confirmed as before.
      const waiting = unconfirmedOf(p).find((x) => x.check === m.check) ?? { check: m.check, measure: m, dueDay: m.day, upSeatId: null };
      return mayConfirm(p, waiting, { userId: uid, manager: isManager, me: actor.me }, deputyRoleId, state.seats) ? OK : no("projects.permConfirmWho");
    }

    case "project.measure.questioned": {
      // Sending a typed result back (plan RES, D14): by someone who may confirm it, at most twice, never a result a manager alone confirms.
      const m = p.measures.find((x) => x.check === pl.check);
      if (!m || m.confirmed || m.sourceKind !== "typed" || m.sentBack || !revisionMatches(pl.measureEventId, m.eventId)) return no("projectResult.permQuestionNothing");
      if (m.managerOnly) return no("projectResult.permManagerOnly");
      if (m.questions.length >= 2) return no("projectResult.permQuestionTwice");
      if (!text(pl.why, QUESTION_WHY_MAX)) return no("projectResult.permQuestionWhy");
      const deputyRoleId = state.routes.find((r) => r.id === p.routeId)?.deputyRoleId ?? null;
      const waiting = unconfirmedOf(p).find((x) => x.check === m.check) ?? { check: m.check, measure: m, dueDay: m.day, upSeatId: null };
      return mayConfirm(p, waiting, { userId: uid, manager: isManager, me: actor.me }, deputyRoleId, state.seats) ? OK : no("projectResult.permQuestionWho");
    }

    case "project.baseline.confirmed": {
      // A second person confirms the baseline number before the start (D16): the accepted sponsor or the route's deputy, managers when neither exists (a deputy desk whose holders are all the lead or the typist counts as none, D30).
      const b = p.baseline;
      if (b === null || b.none || b.confirmed || p.status !== "planning" || !live || !revisionMatches(pl.baselineEventId, b.eventId)) return no("projectResult.permBaselineNothing");
      if (isMe(p.leadUserId) || isMe(b.byUserId ?? null)) return no("projectResult.permBaselineConfirmWho");
      const deputyRoleId = state.routes.find((r) => r.id === p.routeId)?.deputyRoleId ?? null;
      if (sponsor || holds(deputyRoleId)) return OK;
      // A deputy desk counts as empty when none of its holders may confirm: each is the lead or who typed the baseline (D30). Then a manager does.
      const deputyStaffed = deputyRoleId !== null
        && seatsOfRole(state.seats, deputyRoleId).some((x) => x.userId !== null && x.userId !== p.leadUserId && x.userId !== (b.byUserId ?? null));
      // An accepted sponsor who leads it counts as none (D26).
      const hasSponsor = p.sponsorUserId !== null && p.sponsorUserId !== p.leadUserId;
      return isManager && !hasSponsor && !deputyStaffed ? OK : no("projectResult.permBaselineConfirmWho");
    }

    case "project.help.asked": {
      // The lead or a member asks the sponsor for help on a step that is still open (D19).
      if (!onTeam) return no("projectResult.permHelpTeam");
      if (p.status !== "running") return no("projectResult.permRunningOnly");
      const step = p.steps.find((x) => x.id === pl.stepId);
      if (!step || step.column === "done" || step.dropped) return no("projectResult.permHelpStep");
      return text(pl.text, HELP_TEXT_MAX) ? OK : no("projectResult.permHelpText");
    }

    case "project.rewarded":
      if (!isManager) return no("projects.permRewardManager");
      return p.rewardDue ? OK : no("projects.permNoRewardDue");

    case "project.claimed":
      if (!p.authorUserIds.some(isMe)) return no("projects.permClaimAuthor");
      return p.reward && !p.claimed ? OK : no("projects.permNoRewardToClaim");

    case "project.stopped":
      if (!(answers || escalatedHolder)) return no("projectMove.permSponsorOrLead");
      if (!live) return no("projects.permAlreadyClosed");
      return text(pl.why) ? OK : no("projects.permStopWhy");

    case "project.doneby.moved": {
      // The lead once; the sponsor, a stalled seat's holder and a manager whenever (D19).
      const lead = isMe(p.leadUserId);
      const mayAnytime = sponsor || upSeat || isManager;
      if (!(mayAnytime || lead)) return no("projectMove.permSponsorOrLead");
      if (p.status !== "running") return no("projectMove.permRunningOnly");
      if (!whole(pl.doneBy) || pl.doneBy <= state.day) return no("projectMove.permDoneByDay");
      if (!text(pl.why, 400)) return no("projectMove.permWhy");
      return mayAnytime || !p.doneByMoves.some((m) => m.byLead) ? OK : no("projectMove.permDoneByOnce");
    }

    case "project.paused":
      if (!isLead) return no("projectMove.permSponsorOrLead");
      if (p.status !== "running") return no("projectMove.permRunningOnly");
      if (paused) return no("projectMove.permPaused");
      if (!whole(pl.untilDay) || pl.untilDay <= state.day || pl.untilDay > state.day + PAUSE_MAX_DAYS) return no("projectMove.permPauseDays");
      return text(pl.why, 400) ? OK : no("projectMove.permWhy");

    case "project.resumed":
      if (!(isLead || sponsor)) return no("projectMove.permSponsorOrLead");
      return paused ? OK : no("projectMove.permNotPaused");

    case "project.howwework":
      if (!isLead) return no("projectMove.permSponsorOrLead");
      if (!(p.status === "planning" || p.status === "running")) return no("projectMove.permRunningOnly");
      if (!whole(pl.checkInWeekday) || pl.checkInWeekday < 1 || pl.checkInWeekday > 5) return no("projectMove.permCheckInDay");
      return pl.note === undefined || (typeof pl.note === "string" && pl.note.length <= 400) ? OK : no("projectMove.permHowNote");

    case "project.update": {
      // The lead, a manager or the accepted sponsor (AGT D15). Nothing in the payload, an AI draft flag included, grants a right.
      if (!(isLead || sponsor)) return no("projectMove.permSponsorOrLead");
      if (!live || p.startedDay === null) return no("projectMove.permRunningOnly");
      if (!text(pl.text, 4000)) return no("projectMove.permUpdateText");
      // The week is the project's due check-in day in the company calendar, nothing else: not an old week, not a future one,
      // none before the start. Sending it again for the same week is a revision of that update, not another weekly send.
      return pl.week !== undefined && pl.week === dueCheckInDay(p, state) ? OK : no("projectMove.permUpdateWeek");
    }

    case "project.lead.changed": {
      // A new lead is named only while there is none, by whom mayNameLead says (D14, D31).
      if (p.leadVacatedDay === null) return no("projectMove.permLeadPresent");
      if (!live) return no("projects.permClosed");
      if (!mayNameLead(p, state.routes.find((r) => r.id === p.routeId), { userId: uid, me: actor.me, manager: isManager })) return no("projectMove.permNameLead");
      return typeof pl.toUserId === "string" && pl.toUserId !== "" ? OK : no("projectMove.permLeadTarget");
    }

    case "project.lead.vacated":
      // Only the leaver path writes it, on the server (D14).
      return no("projectMove.permSystemOnly");

    default:
      return no("projects.permNotAllowed");
  }
}
