// The routing trail of a case, for the person who raised it (LOOP/D15, spec 04 'Case page').
// Pure. Moved rows carry destination and day only, never the person who moved the route.
import type { Role } from "@/config/roles";
import { holdsRole, type Me } from "@/features/auth/identity";
import type { ReducedCase } from "./reducer";

export type RoutingRow =
  | { kind: "proposed"; routeId: string | null; source: "llm" | "keywords" }
  | { kind: "sent"; routeId: string | null; chosenBy: "raiser" | "proposal" }
  | { kind: "proposed-sent"; routeId: string | null; source: "llm" | "keywords" }
  | { kind: "moved"; routeId: string; day: number };

export function routingTrail(c: ReducedCase): RoutingRow[] {
  const raised = c.history.find((e) => e.type === "case.raised");
  const proposal = raised?.payload?.proposal ?? null;
  const sentId = raised?.payload?.routeId ?? null;
  const rows: RoutingRow[] = [];
  if (proposal && proposal.routeId !== null && proposal.routeId === sentId) {
    rows.push({ kind: "proposed-sent", routeId: sentId, source: proposal.source });
  } else {
    if (proposal && proposal.routeId !== null) rows.push({ kind: "proposed", routeId: proposal.routeId, source: proposal.source });
    rows.push({ kind: "sent", routeId: sentId, chosenBy: "raiser" });
  }
  for (const e of c.history) {
    if (e.type === "case.override" && e.payload?.chosen) rows.push({ kind: "moved", routeId: e.payload.chosen, day: e.day | 0 });
  }
  return rows;
}

export function seesRouting(c: ReducedCase, me: Me, role: Role): boolean {
  return (c.fromUserId !== null && c.fromUserId === me.userId)
    || holdsRole(me, c.assigneeRoleId)
    || holdsRole(me, c.escalated?.toRoleId ?? null)
    || role === "manager";
}
