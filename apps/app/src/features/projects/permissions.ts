// Who may append which project.* event - the server's copy of the rules the project pages follow
// (docs/plans/2026-10-15_idea-to-project.md, "New events"). Called from features/cases/permissions.ts.
// Pure: the reduced state in, a verdict out.
import type { Actor, Verdict } from "@/features/cases/permissions";
import type { EventPayload } from "@/features/cases/events";
import type { State } from "@/features/cases/reducer";
import { translate, DEFAULT_LOCALE, type Locale, type MessageKey } from "@/i18n";
import { byClock } from "@/features/clock/actor";
import { TEMPLATES } from "@/features/templates/library";
import { mayConfirm, unconfirmedOf } from "./confirm";
import { isMeasureSource, readImpact } from "./measure-source";
import { STEP_COLUMNS, SYNC_SYSTEMS, type InviteRole } from "./types";

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
      if (!(isLead || escalatedHolder)) return no("projects.permLeadOnly");
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
      return p.baseline ? OK : no("projects.permStartNeedsBaseline");

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

    case "project.done":
      if (!isLead) return no("projects.permLeadOnly");
      return p.status === "running" ? OK : no("projects.permOnlyRunningDone");

    case "project.measured": {
      if (!isLead) return no("projects.permLeadOnly");
      const check = p.checks.find((c) => c.check === pl.check);
      if (!check) return no("projects.permNoCheck");
      if (check.measured) return no("projects.permCheckRecorded");
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
      if (!m || m.confirmed || m.sourceKind === "system") return no("projects.permNothingToConfirm");
      if (isMe(p.leadUserId) || isMe(m.byUserId)) return no("projects.permConfirmSecondPerson");
      const deputyRoleId = state.routes.find((r) => r.id === p.routeId)?.deputyRoleId ?? null;
      // A stopped project waits for nobody (unconfirmedOf), but its number can still be confirmed as before.
      const waiting = unconfirmedOf(p).find((x) => x.check === m.check) ?? { check: m.check, measure: m, dueDay: m.day, upSeatId: null };
      return mayConfirm(p, waiting, { userId: uid, manager: isManager, me: actor.me }, deputyRoleId, state.seats) ? OK : no("projects.permConfirmWho");
    }

    case "project.rewarded":
      if (!isManager) return no("projects.permRewardManager");
      return p.rewardDue ? OK : no("projects.permNoRewardDue");

    case "project.claimed":
      if (!p.authorUserIds.some(isMe)) return no("projects.permClaimAuthor");
      return p.reward && !p.claimed ? OK : no("projects.permNoRewardToClaim");

    case "project.stopped":
      if (!(isLead || escalatedHolder)) return no("projects.permLeadOnly");
      if (!live) return no("projects.permAlreadyClosed");
      return text(pl.why) ? OK : no("projects.permStopWhy");

    default:
      return no("projects.permNotAllowed");
  }
}
