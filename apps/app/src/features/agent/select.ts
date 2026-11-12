// What the daily run looks at (plan AGT, D12, D16, D17): which projects, which clock facts a nudge may ride on, which kinds of suggestion are
// wanted, what expires, and which of the brain's suggestions are kept. Pure: reduced state, the log and the day in, a list out. Workdays only:
// in demo mode the clock and the agent do not fire (D9).
import type { EventLog } from "@/features/cases/events";
import type { ClockSpec } from "@/features/clock";
import { checkInDayOf } from "@/features/projects/rhythm";
import type { ReducedProject, Step } from "@/features/projects/types";
import type { AgentReply } from "./contract";
import { MAX_SUGGESTIONS, REPEAT_DAYS, RIDE_KINDS, SUGGESTION_EXPIRE_DAYS } from "./limits";
import type { AgentProject, AgentState, AgentSuggestion, AgentSuggestionKind } from "./types";

/** A clock fact a nudge may ride on: its event id, kind, the step it is about (late and blocked), its due day and its place in the log. */
export type Ride = { id: string; kind: (typeof RIDE_KINDS)[number]; stepId: string | null; dueDay: number | null; day: number; index: number };

/**
 * A step still to do. A step dropped on the Done sheet (plan RES: `Step.dropped`) is no longer one; the field is read without importing RES's type, so
 * this file stands on a base with and without it.
 */
export const stepIsOpen = (s: Step): boolean => s.column !== "done" && !(s as { dropped?: unknown }).dropped;

const isRideKind = (k: unknown): k is Ride["kind"] => (RIDE_KINDS as readonly unknown[]).includes(k);

/** The day the run looks back to: the previous run's, and before the first one the working day before today. */
export const sinceDayOf = (agent: Pick<AgentState, "lastRunDay">, today: number): number => agent.lastRunDay ?? today - 1;

/** The days a project has been seen since: its own last finished turn, else the company's previous run (a log from before per-project entries), else nothing. */
function lastSeenDay(ap: AgentProject, agent: Pick<AgentState, "lastRunDay">): number | null {
  return ap.lastRun?.runDay ?? agent.lastRunDay;
}

/**
 * The projects the run calls the brain for: running (started, not done, not stopped), not paused today, with the agent on, and changed since the
 * project's last finished turn: an event or a clock fact on it after that day, or a step that fell due since. Never in demo mode.
 */
export function projectsToRun(state: { projects: ReducedProject[] }, agent: AgentState, _log: EventLog, today: number, clock: ClockSpec): ReducedProject[] {
  if (clock.mode !== "workdays") return [];
  return state.projects.filter((p) => {
    const ap = agent.projects[p.id];
    // A start before working day 1 is a demo seed's history: it has nobody to talk to.
    if (!ap?.on || p.status !== "running" || typeof p.startedDay !== "number" || p.startedDay < 1) return false;
    if (p.pausedUntil !== null && today <= p.pausedUntil) return false;
    const seen = lastSeenDay(ap, agent);
    if (seen === null) return true;
    const stepFell = p.steps.some((s) => stepIsOpen(s) && s.dueDay !== null && s.dueDay < today && s.dueDay >= seen);
    return stepFell || p.history.some((e) => e.day > seen);
  });
}

/** The clock facts of RIDE_KINDS on a project written after `sinceDay`, in the order of the log. Facts of other kinds are not rides. */
export function ridesFor(projectId: string, log: EventLog, sinceDay: number): Ride[] {
  const out: Ride[] = [];
  log.events.forEach((e, index) => {
    if (e.type !== "clock.due" || e.target !== projectId || e.day <= sinceDay) return;
    const kind = e.payload.kind;
    if (!isRideKind(kind)) return;
    out.push({ id: e.id, kind, stepId: e.payload.stepId ?? null, dueDay: typeof e.payload.dueDay === "number" ? e.payload.dueDay : null, day: e.day, index });
  });
  return out;
}

const openStep = (p: ReducedProject, id: string | null): boolean => id !== null && p.steps.some((s) => s.id === id && stepIsOpen(s));

/** Dismissed within the last REPEAT_DAYS working days: it is offered again from the REPEAT_DAYS-th day after. */
const recentlyDismissed = (s: AgentSuggestion, today: number): boolean => s.status === "dismissed" && s.answeredDay !== null && today - s.answeredDay < REPEAT_DAYS;

/**
 * The kinds worth asking the brain for today (D12, D17).
 * - unblock: a ride on a step (late, blocked) or on the project (quiet, stalled) with no open Unblock for it, none dismissed in the last REPEAT_DAYS,
 *   and no accepted nudge that rode on a fact as new as this one (an accepted nudge is that step's reminder: only a newer fact for it asks again).
 *   Newer is the order of the log, not the day.
 * - report: from the week's check-in day while that week has no project.update and no Report suggested for it.
 * - plan: none open and none dismissed in the last REPEAT_DAYS.
 */
export function wantedKinds(p: ReducedProject, ap: AgentProject, rides: readonly Ride[], today: number, clock: ClockSpec, log: EventLog): AgentSuggestionKind[] {
  const out: AgentSuggestionKind[] = [];
  const unblocks = ap.suggestions.filter((s) => s.kind === "unblock");
  const indexOf = (id: string | null): number => (id === null ? -1 : log.events.findIndex((e) => e.id === id));
  const anyOpenStep = p.steps.some(stepIsOpen);
  const rideable = rides.some((r) => {
    const mine = r.stepId === null ? unblocks : unblocks.filter((s) => s.stepId === r.stepId);
    if (r.stepId !== null ? !openStep(p, r.stepId) : !anyOpenStep) return false;
    if (mine.some((s) => s.status === "open")) return false;
    if (mine.some((s) => recentlyDismissed(s, today) && (r.stepId !== null || s.ridesOn === r.id))) return false;
    // An accepted nudge is the step's reminder, until the clock writes a newer fact for it (or, for the project, a newer one than it rode on).
    return !mine.some((s) => s.status === "accepted" && indexOf(s.ridesOn) >= r.index);
  });
  if (rideable) out.push("unblock");

  if (clock.mode === "workdays") {
    const c = checkInDayOf(p, today, clock);
    const reports = ap.suggestions.filter((s) => s.kind === "report");
    if (c !== null && today >= c && p.latestUpdate?.week !== c && !reports.some((s) => s.week === c)) out.push("report");
  }

  const plans = ap.suggestions.filter((s) => s.kind === "plan");
  if (!plans.some((s) => s.status === "open" || recentlyDismissed(s, today))) out.push("plan");
  return out;
}

/** The open suggestions made SUGGESTION_EXPIRE_DAYS or more working days ago: the run dismisses them as `expired`, no model needed. */
export function expiries(agent: Pick<AgentState, "projects">, today: number): AgentSuggestion[] {
  return Object.values(agent.projects).flatMap((ap) => ap.suggestions.filter((s) => s.status === "open" && today - s.day >= SUGGESTION_EXPIRE_DAYS));
}

/**
 * Which of the brain's suggestions the app keeps: at most one per wanted kind and MAX_SUGGESTIONS in all. An Unblock needs a step of the project that
 * is still open and a ride id the request carried (for a late or blocked ride, that ride's own step); a Report needs its draft; a Plan needs the step it
 * proposes. Everything else is dropped, whatever the model said.
 */
export function keepSuggestions(reply: Pick<AgentReply, "suggestions">, wanted: readonly AgentSuggestionKind[], p: ReducedProject, rides: readonly Ride[]): AgentReply["suggestions"] {
  const kept: AgentReply["suggestions"] = [];
  const seen = new Set<AgentSuggestionKind>();
  for (const s of reply.suggestions) {
    if (kept.length >= MAX_SUGGESTIONS) break;
    if (!wanted.includes(s.kind) || seen.has(s.kind)) continue;
    const ok = s.kind === "unblock" ? unblockOk(s, p, rides) : s.kind === "report" ? s.draft.trim().length > 0 : s.step !== null && s.step.title.trim().length > 0;
    if (!ok) continue;
    seen.add(s.kind);
    kept.push(s);
  }
  return kept;
}

function unblockOk(s: AgentReply["suggestions"][number], p: ReducedProject, rides: readonly Ride[]): boolean {
  if (!openStep(p, s.step_id)) return false;
  const ride = rides.find((r) => r.id === s.fact_id);
  return ride !== undefined && (ride.stepId === null || ride.stepId === s.step_id) && s.draft.trim().length > 0;
}
