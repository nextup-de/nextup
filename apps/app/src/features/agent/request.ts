// The agent's request to the brain (plan AGT, D3, D16): the reduced project and nothing else. A step's owner is a role label or "no owner";
// no display name, no user id, no raw event leaves here. The texts (titles, reasons) are redacted by AGT-J1 before they are sent.
import type { Locale } from "@/i18n";
import type { ReducedProject, Step } from "@/features/projects/types";
import type { AgentRequest } from "./contract";
import { stepIsOpen, type Ride } from "./select";
import type { AgentSuggestionKind } from "./types";

const clip = (s: string, max: number): string => (s.length <= max ? s : s.slice(0, max));
/** At most this many steps go out: the open ones first. */
const MAX_STEPS = 60;

/**
 * `roleLabel` says the role of a step's owner (the seat's role title), or null when it cannot; a step with no owner is "no owner". `company` is the
 * redacted company name AGT-J1 puts in; every brain call carries one.
 */
export function agentRequestOf(
  p: ReducedProject, rides: readonly Ride[], wanted: readonly AgentSuggestionKind[], today: number, locale: Locale, roleLabel: (step: Step) => string | null,
  company = "-", checkInDay: number | null = null,
): AgentRequest {
  const open = p.steps.filter(stepIsOpen);
  const rest = p.steps.filter((s) => !stepIsOpen(s));
  return {
    company: clip(company, 120) || "-",
    locale: locale === "de" ? "de" : "en",
    today,
    project: {
      id: p.id,
      title: clip(p.title, 300),
      goal: p.goal ? clip(p.goal.goal, 400) : null,
      done_when: p.goal ? clip(p.goal.doneWhen, 400) : null,
      done_by: p.doneBy,
      paused_until: p.pausedUntil !== null && p.pausedUntil >= today ? p.pausedUntil : null,
      last_activity_day: p.lastActivityDay,
      latest_update: p.latestUpdate ? { week: p.latestUpdate.week, day: p.latestUpdate.day } : null,
      check_in_day: checkInDay,
      week_sent: checkInDay !== null && p.latestUpdate?.week === checkInDay,
      steps: [...open, ...rest].slice(0, MAX_STEPS).map((s) => ({
        id: s.id,
        title: clip(s.text, 200),
        role: s.role ?? null,
        column: s.column,
        due_day: s.dueDay,
        owner: s.ownerUserId ? clip(roleLabel(s) ?? "no owner", 80) : "no owner",
        blocked_why: s.column === "blocked" && s.why ? clip(s.why, 400) : null,
      })),
      facts: rides.slice(0, 40).map((r) => ({ id: r.id, kind: r.kind, step_id: r.stepId, day: r.dueDay ?? r.day })),
    },
    kinds: [...wanted],
  };
}
