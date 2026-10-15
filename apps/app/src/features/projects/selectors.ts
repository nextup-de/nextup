// Selectors over the reduced projects. A project is seen from four sides: the lead's and the team's
// (their board), the authors' ("what my idea became"), the deputy's (a late start or measure), and
// a manager's (all of them).
import type { EventLog } from "@/features/cases/events";
import type { ReducedCase, State } from "@/features/cases/reducer";
import type { ReducedProject } from "./types";

const named = (p: ReducedProject, name: string) => p.lead === name || p.members.includes(name);

export const projectById = (state: State, id: string): ReducedProject | undefined => state.projects.find((p) => p.id === id);

/** The project an archived idea became, if a yes opened (or joined) one. */
export const projectOfCase = (state: State, c: Pick<ReducedCase, "id" | "decided">): ReducedProject | undefined =>
  c.decided?.projectId ? projectById(state, c.decided.projectId) : state.projects.find((p) => p.sources.includes(c.id));

/** Projects this person leads or works on. */
export const projectsOf = (state: State, name: string): ReducedProject[] => state.projects.filter((p) => named(p, name));

/** Projects that came from this person's ideas (they posted under `handle` - or their name). */
export const projectsFrom = (state: State, who: string | null): ReducedProject[] =>
  who ? state.projects.filter((p) => p.authors.includes(who)) : [];

/** Projects whose next move is late and sits with `name` as the deputy (or the route's owner). */
export const projectsEscalatedTo = (state: State, name: string): ReducedProject[] =>
  state.projects.filter((p) => p.escalated?.to === name);

/** What a lead must do next on a project, as a fact - the page builds the sentence. */
export type ProjectMove = "baseline" | "start" | "steps" | "done" | "measure" | "reward" | null;

export function nextMove(p: ReducedProject, day: number): ProjectMove {
  switch (p.status) {
    case "planning": return p.baseline ? "start" : "baseline";
    case "running": return p.steps.length && p.steps.every((s) => s.column === "done") ? "done" : "steps";
    case "measuring": return p.checks.some((c) => !c.measured && day >= c.opensDay) ? "measure" : null;
    case "measured": return p.rewardDue ? "reward" : null;
    default: return null;
  }
}

/** Steps per column, in the order they were added. */
export const board = (p: ReducedProject) => ({
  todo: p.steps.filter((s) => s.column === "todo"),
  doing: p.steps.filter((s) => s.column === "doing"),
  blocked: p.steps.filter((s) => s.column === "blocked"),
  done: p.steps.filter((s) => s.column === "done"),
});

export type ProjectComment = { id: string; by: string; text: string; day: number };

/** What was said on a project - read from the log, like case comments (features/cases/selectors commentsOn). */
export const projectCommentsOn = (log: EventLog, projectId: string): ProjectComment[] =>
  log.events
    .filter((e) => e.target === projectId && e.type === "project.commented")
    .map((e) => ({ id: e.id, by: e.actor, text: e.payload.text ?? "", day: e.day }));

/** "P-12" */
export const projectLabel = (p: Pick<ReducedProject, "number">) => "P-" + p.number;
