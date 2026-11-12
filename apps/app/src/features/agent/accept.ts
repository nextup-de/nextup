// What an accepted or dismissed suggestion writes (plan AGT, D12, D13, D14, D15). Pure: the person, the reduced project, the suggestion and its
// words in; the events to write, in order, or the reason none is written. The server action (server/agent/actions.ts) writes them in ONE
// transaction under a lock and asks again inside it, so what is decided here is decided on the state it commits against.
//
// Every follow-up event is checked with `mayAppend` for the person who accepts, the Report's update included: the agent layer and the project
// layer say the same thing, and no event is written that the project's own rules would refuse. Nothing here trusts the client: the nudge's
// recipients come from the current project and the current seats, never from a request.
import type { Actor } from "@/features/auth/identity";
import type { EventPayload } from "@/features/cases/events";
import type { AppEventType } from "@/features/cases/persist";
import { mayAppend } from "@/features/cases/permissions";
import type { State } from "@/features/cases/reducer";
import { checkInDayOf, previousCheckInDayOf } from "@/features/projects/rhythm";
import type { ReducedProject, Step } from "@/features/projects/types";
import type { Locale } from "@/i18n";
import { stepIsOpen } from "./select";
import { checkAgentText, checkDismissWhy, mayAnswerSuggestion, type PermKey } from "./permissions";
import type { AgentSuggestion, SuggestionText } from "./types";

/** Why nothing was written: a permission key, or one of the two keys only the acceptance knows. */
export type AcceptKey = PermKey | "projectAgent.acceptStale" | "projectAgent.removedText";

/** One event the action writes: the id and the idempotency key are fixed by the suggestion, so a retried request writes the same rows again or none. */
export type PlannedEvent = { id: string; type: AppEventType; target: string; payload: EventPayload; idemKey: string };

export type AcceptPlan =
  | { ok: true; events: PlannedEvent[]; /** The words as accepted (the nudge, the update, the step's title), for the Agent tab's history. */ text: string; toUserIds: string[] }
  | { ok: false; key: AcceptKey; /** The project's own refusal, already in the person's language, when `mayAppend` said no. */ error?: string };

export type DismissPlan = { ok: true; events: PlannedEvent[] } | { ok: false; key: PermKey };

export type AcceptInput = {
  actor: Actor;
  project: ReducedProject;
  suggestion: AgentSuggestion;
  /** The suggestion's words, or null when the retention run removed them. */
  words: SuggestionText | null;
  /** What the person typed over the draft (Unblock nudge, Report text, Plan step title); undefined = send as drafted. */
  editedText?: string;
  /** The company's state (day, clock, seats) the project is read from; the follow-up is validated against it. */
  state: State;
  /** The users of the company that are active right now; a nudge goes to none other. */
  activeUserIds: ReadonlySet<string>;
  locale?: Locale;
};

const MAX_ID = 64;
/** A stable, id-shaped name derived from the suggestion's id (the id of an event, a step): the same suggestion gives the same name, always. */
function derived(id: string, suffix: string): string {
  const s = `${id}-${suffix}`;
  return s.length <= MAX_ID ? s : `${id.slice(0, MAX_ID - suffix.length - 1)}-${suffix}`;
}
export const acceptedIdOf = (suggestionId: string): string => derived(suggestionId, "ac");
export const dismissedIdOf = (suggestionId: string): string => derived(suggestionId, "di");
export const followUpIdOf = (suggestionId: string): string => derived(suggestionId, "fu");
export const stepIdOf = (suggestionId: string): string => derived(suggestionId, "st");

/** The idempotency keys of D14: the answer's own, and its follow-up's per kind. */
export const acceptKeyOf = (suggestionId: string): string => `agt:acc:${suggestionId}`;
export const followUpKeyOf = (suggestionId: string, kind: "project.update" | "project.step.added"): string => `agt:acc:${suggestionId}:${kind}`;
export const dismissKeyOf = (suggestionId: string): string => `agt:dis:${suggestionId}`;

/**
 * Who a nudge to this step may go to: the step's owner; else the people of the step's role. `lead`, `sponsor` and `team` are the project's roles
 * (the lead, the accepted sponsor, the lead and the members), never roles of the org chart. Candidates only: the caller keeps the ones that are
 * active in the company and not the sender; a step with neither owner nor role has none.
 */
export function nudgeCandidates(p: ReducedProject, step: Step): string[] {
  if (step.ownerUserId) return [step.ownerUserId];
  const role = step.role ?? null;
  if (role === "lead") return p.leadUserId ? [p.leadUserId] : [];
  if (role === "sponsor") return p.sponsorUserId ? [p.sponsorUserId] : [];
  if (role === "team") return [...(p.leadUserId ? [p.leadUserId] : []), ...p.memberUserIds];
  return [];
}

/** The check-in day an update may be for, as the project's own rule has it: the latest one that has arrived (features/projects/permissions.ts). */
export function dueWeekOf(p: ReducedProject, state: Pick<State, "day" | "clock">): number | null {
  const current = checkInDayOf(p, state.day, state.clock);
  if (current === null) return null;
  return current <= state.day ? current : previousCheckInDayOf(p, current, state.clock);
}

const stale = (): AcceptPlan => ({ ok: false, key: "projectAgent.acceptStale" });
const refused = (key: AcceptKey): AcceptPlan => ({ ok: false, key });
const same = (a: string, b: string) => a.trim() === b.trim();

/**
 * The events an acceptance writes, in order: always `agent.accepted`; a Report then `project.update` (week = the check-in day due now, aiDrafted),
 * a Plan then `project.step.added` (the proposed or edited title, due today + dueInDays). Refused, with nothing written, when the person may not
 * answer, the suggestion is answered, the text is empty or too long, what it is about has changed (the step is gone or done, the week is no longer
 * the one due, the words are removed) or the project's own rules refuse the follow-up for this person.
 */
export function acceptPlan(i: AcceptInput): AcceptPlan {
  const { actor, project: p, suggestion: s, words, state } = i;
  const viewer = { userId: actor.userId, role: actor.role, me: actor.me };
  const can = mayAnswerSuggestion(viewer, p, s);
  if (!can.ok) return refused(can.key);
  if (words === null) return refused("projectAgent.removedText");
  if (p.stopped !== null || p.doneDay !== null) return stale();

  const draft = s.kind === "plan" ? (words.step?.title ?? "") : words.draft;
  if (s.kind === "plan" && words.step === null) return stale();
  const text = (i.editedText ?? draft).trim();
  const checked = checkAgentText(s.kind, text);
  if (!checked.ok) return refused(checked.key);
  const edited = i.editedText !== undefined && !same(i.editedText, draft);
  const accepted = (extra: EventPayload): PlannedEvent => ({
    id: acceptedIdOf(s.id), type: "agent.accepted", target: p.id, idemKey: acceptKeyOf(s.id),
    payload: { suggestionId: s.id, suggestionKind: s.kind, edited, ...extra },
  });

  if (s.kind === "unblock") {
    const step = p.steps.find((x) => x.id === s.stepId);
    if (!step || !stepIsOpen(step)) return stale();
    const named = nudgeCandidates(p, step);
    const toUserIds = [...new Set(named)].filter((u) => u !== actor.userId && i.activeUserIds.has(u));
    if (toUserIds.length === 0) return refused("projectAgent.permText");
    return { ok: true, text, toUserIds, events: [accepted({ text, toUserIds, stepId: step.id })] };
  }

  if (s.kind === "report") {
    const week = dueWeekOf(p, state);
    if (week === null || s.week !== week) return stale();
    if (p.latestUpdate?.week === week) return refused("projectAgent.permWeekSent");
    const follow: PlannedEvent = {
      id: followUpIdOf(s.id), type: "project.update", target: p.id, idemKey: followUpKeyOf(s.id, "project.update"),
      payload: { text, week, aiDrafted: true },
    };
    const verdict = mayAppend(actor, follow, state, i.locale);
    if (!verdict.ok) return { ok: false, key: "projectAgent.acceptStale", error: verdict.error };
    return { ok: true, text, toUserIds: [], events: [accepted({ followUpId: follow.id, week }), follow] };
  }

  // A Plan: one step, in To do, for the role the agent named when that is a project role of someone who is there.
  const proposed = words.step;
  if (proposed === null) return stale();
  const due = Number.isInteger(proposed.dueInDays) && proposed.dueInDays >= 0 ? proposed.dueInDays : 0;
  const ownerUserId = proposed.role === "lead" ? p.leadUserId : proposed.role === "sponsor" ? p.sponsorUserId : null;
  const payload: EventPayload = {
    stepId: stepIdOf(s.id), text, dueDay: state.day + due, aiDrafted: true,
    ...(ownerUserId ? { ownerUserId } : {}), ...(proposed.role === "lead" && p.leadUserId && p.lead ? { owner: p.lead } : {}),
  };
  const follow: PlannedEvent = { id: followUpIdOf(s.id), type: "project.step.added", target: p.id, idemKey: followUpKeyOf(s.id, "project.step.added"), payload };
  const verdict = mayAppend(actor, follow, state, i.locale);
  if (!verdict.ok) return { ok: false, key: "projectAgent.acceptStale", error: verdict.error };
  return { ok: true, text, toUserIds: [], events: [accepted({ followUpId: follow.id, stepId: stepIdOf(s.id) }), follow] };
}

/** The event a dismissal writes: the lead's, a manager's, or (a Report) the sponsor's, with the reason when there is one. */
export function dismissPlan(i: { actor: Actor; project: ReducedProject; suggestion: AgentSuggestion; why?: string }): DismissPlan {
  const { actor, project: p, suggestion: s } = i;
  const can = mayAnswerSuggestion({ userId: actor.userId, role: actor.role, me: actor.me }, p, s);
  if (!can.ok) return { ok: false, key: can.key };
  const why = (i.why ?? "").trim();
  const checked = checkDismissWhy(why);
  if (!checked.ok) return { ok: false, key: checked.key };
  return {
    ok: true,
    events: [{ id: dismissedIdOf(s.id), type: "agent.dismissed", target: p.id, idemKey: dismissKeyOf(s.id), payload: { suggestionId: s.id, ...(why ? { why } : {}) } }],
  };
}

/** The words of a suggestion as AgentText holds them: one JSON text of a SuggestionText. */
export const suggestionTextToJson = (w: SuggestionText): string => JSON.stringify(w);

/** Reads a stored suggestion text; null for anything that is not one (a damaged or foreign row is no text, never a half-filled one). */
export function parseSuggestionText(raw: string | undefined): SuggestionText | null {
  if (raw === undefined) return null;
  try {
    const v: unknown = JSON.parse(raw);
    if (typeof v !== "object" || v === null) return null;
    const o = v as Record<string, unknown>;
    if (typeof o.title !== "string" || typeof o.why !== "string" || typeof o.draft !== "string") return null;
    const st = o.step;
    if (st === null || st === undefined) return { title: o.title, why: o.why, draft: o.draft, step: null };
    if (typeof st !== "object") return null;
    const x = st as Record<string, unknown>;
    if (typeof x.title !== "string" || typeof x.role !== "string" || typeof x.dueInDays !== "number") return null;
    return { title: o.title, why: o.why, draft: o.draft, step: { title: x.title, role: x.role, dueInDays: x.dueInDays } };
  } catch {
    return null;
  }
}
