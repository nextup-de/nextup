// How often people overrule the router (docs/plans AIP D10). Pure: events in, counts out.
// Per company only - never a number per person (PILOT/HD5).
import type { CaseEvent } from "@/features/cases/events";

export type OverrideRate = { proposed: number; overridden: number; rate: number | null };

/**
 * A case counts as proposed when its case.raised carries a proposal with a routeId, and as
 * overridden when the route it was raised on differs from the proposal's or a case.override
 * follows. `from` / `to`: the day window (inclusive) of the raise.
 */
export function overrideRate(events: readonly CaseEvent[], from?: number, to?: number): OverrideRate {
  const overrides = new Set(events.filter((e) => e.type === "case.override" && e.target).map((e) => e.target));
  let proposed = 0;
  let overridden = 0;
  for (const e of events) {
    if (e.type !== "case.raised") continue;
    if (from !== undefined && e.day < from) continue;
    if (to !== undefined && e.day > to) continue;
    const proposal = e.payload.proposal;
    if (!proposal?.routeId) continue;
    proposed++;
    const chosen = e.payload.routeId ?? null;
    if (chosen !== proposal.routeId || (e.target && overrides.has(e.target))) overridden++;
  }
  return { proposed, overridden, rate: proposed < 1 ? null : overridden / proposed };
}
