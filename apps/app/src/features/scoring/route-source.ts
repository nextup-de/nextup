// Where a case's route came from, read from its own history (HD16: a model proposes, a person or a
// rule decides). Pure.
import type { CaseEvent } from "@/features/cases/events";

export type RouteSource = "keywords" | "person" | "llm";

/**
 * The source of the route on the case.raised event in `history`: no proposal -> null; raised on
 * another route than proposed -> a person; a case.override in `history` (or `override` given) ->
 * a person; else the proposal's own source.
 */
export function routeSourceOf(history: readonly CaseEvent[], override?: { chosen: string } | null): RouteSource | null {
  const raised = history.find((e) => e.type === "case.raised");
  const proposal = raised?.payload.proposal;
  if (!raised || !proposal) return null;
  if ((raised.payload.routeId ?? null) !== proposal.routeId) return "person";
  if (override || history.some((e) => e.type === "case.override")) return "person";
  return proposal.source;
}
