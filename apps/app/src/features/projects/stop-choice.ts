// What stopping a project may do to the ideas behind it (plan RES, D24): the stopper keeps them archived (the default) or sends them back
// to their desk. Pure: a project and the reduced state in, plain facts and the events to write out. The server (server/actions/project-stop.ts)
// and the demo (components/dashboard/demo/project-acts.ts stopAndReturn) both ask here, so the two never disagree on which cases qualify.
import type { EventPayload } from "@/features/cases/events";
import type { State } from "@/features/cases/reducer";
import type { ReducedProject } from "./types";

/** The stop form's choice: keep the idea archived, or return it to its desk. */
export type StopPick = "keep" | "return";

/** A case.reopened the stop writes for one source case. */
export type ReopenEvent = { type: "case.reopened"; target: string; payload: EventPayload };

/**
 * The cases an idea can go back to: the project's source cases whose latest decision is the yes that opened or joined this project - not
 * decided again since, not withdrawn, not merged. In case-id order, so a retry names them the same way.
 */
export function stopChoice(project: Pick<ReducedProject, "id" | "sources">, state: Pick<State, "cases">): { cases: { id: string; label: string }[] } {
  const cases = state.cases
    .filter((c) => project.sources.includes(c.id))
    .filter((c) => c.withdrawn === null && c.status === "decided" && c.decided !== null && c.decided.answer === "yes" && c.decided.projectId === project.id)
    .map((c) => ({ id: c.id, label: c.title }))
    .sort((a, b) => (a.id < b.id ? -1 : a.id > b.id ? 1 : 0));
  return { cases };
}

/** The source cases the stop leaves alone: they once said yes to the project but their latest decision no longer does. */
export function notEligible(project: Pick<ReducedProject, "id" | "sources">, state: Pick<State, "cases">): { id: string; label: string }[] {
  const eligible = new Set(stopChoice(project, state).cases.map((c) => c.id));
  return state.cases.filter((c) => project.sources.includes(c.id) && !eligible.has(c.id)).map((c) => ({ id: c.id, label: c.title })).sort((a, b) => (a.id < b.id ? -1 : 1));
}

/**
 * The events the choice writes: none for keep, else one case.reopened with why stopped and a new answer date (today + the company's answer
 * length) per case of the choice. Which seat the case opens on is the server's call (the reducer: the route owner's seat).
 */
export function reopenEvents(project: Pick<ReducedProject, "id" | "sources">, state: Pick<State, "cases">, pick: StopPick, today: number, promiseDays: number): ReopenEvent[] {
  if (pick !== "return") return [];
  return stopChoice(project, state).cases.map((c) => ({ type: "case.reopened", target: c.id, payload: { why: "stopped", dueDay: today + promiseDays } }));
}
