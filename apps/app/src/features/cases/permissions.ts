// Who may append which event. The server's copy of the rules the UI already follows: a button
// that is hidden in the browser is only a courtesy, appendEventAction runs this before it writes.
//
// Pure: state in, verdict out. The caller reduces the company's log first, so "is this your case"
// is answered against the same state everybody sees.
import { NOBODY, type Actor as IdentityActor } from "@/features/auth/identity";
import { isProjectId, mayAppendProject } from "@/features/projects/permissions";
import { isClockReason } from "@/features/clock/actor";
import type { EventPayload } from "./events";
import type { State } from "./reducer";
import { onDeskOf } from "./selectors";
import { canOpen, unitsOf, type VisCtx } from "./visibility";
import { createT, DEFAULT_LOCALE, type Locale, type MessageKey, type T } from "@/i18n";

// The identity Actor (features/auth/identity.ts). `userId` and `me` are optional so a caller that has only a
// name and a handle keeps compiling; without them the actor is nobody and holds no desk.
export type Actor = Pick<IdentityActor, "role" | "name" | "handle"> & Partial<Pick<IdentityActor, "userId" | "me">>;
export type Verdict = { ok: true } | { ok: false; error: string };

const OK: Verdict = { ok: true };
const no = (t: T, key: MessageKey): Verdict => ({ ok: false, error: t(key) });

/** Events on a case that only the person holding it (or a manager) may send. */
const DESK_EVENTS = new Set(["case.read", "case.decided", "case.handed", "case.asked"]);
/** Anyone who may open the case may add these to it (FX4). */
const OPEN_CASE_EVENTS = new Set(["case.affected", "case.unaffected", "case.commented"]);
/** Does this event need `access`, the part of the visibility rule that is not in the state? */
export const needsCaseAccess = (type: string): boolean => OPEN_CASE_EVENTS.has(type);
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
        // Q4.21: the reducer moves a case only while it is open or in a discussion; anything else would be dropped.
        if (kase.status === "asked") return no(t, "cases.permHandAsked");
        if (kase.status !== "open" && kase.status !== "discussion") return no(t, "cases.permHandNotOpen");
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
      return typeof ev.payload.body === "string" && ev.payload.body.trim() ? OK : no(t, "cases.permReviseText");

    case ev.type.startsWith("project."):
      return mayAppendProject(actor, { type: ev.type, target: ev.target, payload: ev.payload as EventPayload }, state);

    case ev.type === "case.answered":
      if (!kase) return no(t, "cases.permNoCase");
      return isRaiser(kase) ? OK : no(t, "cases.permAnswerOwner");

    case ev.type === "case.override":
      if (!kase) return no(t, "cases.permNoCase");
      return isManager ? OK : no(t, "cases.permOverrideManager");

    case OPEN_CASE_EVENTS.has(ev.type): {
      // The same answer as for no such case: a refusal must not say that a private case exists.
      if (!kase) return no(t, "cases.permNoCase");
      const viewer = { ...me, userId };
      const ctx = { seats: state.seats, projects: state.projects, ...access };
      return canOpen(kase, { me: viewer, role: actor.role, unitIds: unitsOf(viewer, access) }, ctx) ? OK : no(t, "cases.permNoCase");
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
  if (kase.decided) return no(t, "cases.permAlreadyDecided");
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
