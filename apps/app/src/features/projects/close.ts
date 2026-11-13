// "Closed" is derived, never an event (features/projects/reduce.ts finishProjects). This names the one event that
// closed a project, so its summary is sent once, with that event (decision Q6.20). Pure: the reduced project and
// the company's rules in, the event out.
import type { CaseEvent } from "@/features/cases/events";
import type { LoopRules } from "@/features/loop/rules";
import { revisionMatches } from "./result";
import type { ReducedProject } from "./types";

type Closing = Pick<ReducedProject, "closed" | "status" | "history" | "measures" | "checks" | "reward">;

/**
 * The event that closed the project, or null: it is open, or it was stopped (a stop tells its own story, with the
 * reason). A recognised project closed with its reward. A measured one closed with the event that settled it: the
 * last result, or - where a reward was still possible - the confirmation that showed the result was not better.
 */
export function closingEvent(p: Closing, rules: Pick<LoopRules, "measure" | "recognition" | "reward">): CaseEvent | null {
  if (!p.closed || p.status === "stopped") return null;
  const first = (type: CaseEvent["type"], match: (e: CaseEvent) => boolean = () => true) => p.history.find((e) => e.type === type && match(e)) ?? null;
  if (p.status === "recognised") return first("project.rewarded");

  // The events the reducer counted: a result recorded twice, or refused, is in the history but in no measure.
  const at = (e: CaseEvent | null) => (e === null ? -1 : p.history.indexOf(e));
  // A result is the event that wrote its revision (Measure.eventId): a number entered again after a send-back is the re-entry event, never the
  // first one, even when both carry the same value on the same day. A measure without an id (a seed, a log from before RES) is matched by value and day.
  const resultOf = (check: number) => {
    const m = p.measures.find((x) => x.check === check);
    if (!m) return null;
    if (m.eventId) return p.history.find((e) => e.id === m.eventId) ?? null;
    return first("project.measured", (e) => e.payload.check === check && e.payload.value === m.value && e.day === m.day);
  };
  const results = p.measures.map((m) => resultOf(m.check));
  const settled = p.checks.length === 0 ? first("project.done") : results.reduce<CaseEvent | null>((last, e) => (at(e) > at(last) ? e : last), null);
  // No reward can follow whatever the result: the project closed as soon as it was measured.
  if (!rules.measure || !rules.recognition || rules.reward.kind === "none") return settled;
  // A reward was possible, so it closed only once the latest result was confirmed and was not better.
  const last = p.measures[p.measures.length - 1];
  const typed = last ? at(resultOf(last.check)) : -1;
  // Only a confirmation of that revision, after it, closed the project: one for a replaced number never did (RES review, 12 Nov).
  const confirmed = last
    ? p.history.find((e, i) => e.type === "project.measure.confirmed" && e.payload.check === last.check && i > typed && revisionMatches(e.payload.measureEventId, last.eventId)) ?? null
    : null;
  return at(confirmed) > at(settled) ? confirmed : settled;
}
