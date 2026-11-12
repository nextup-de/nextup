// The stalled projects the Dashboard counts per unit (plan RES, D22). A project counts while its stalled escalation stands today
// (MOV: features/projects/reduce.ts sets `escalated.what === "stalled"` until there is activity), in the unit of the desk that said
// yes: the unit of its first source case, the same `unitId` that case has in the ledger. Pure. Nothing here names a project or a
// lead to the screen: the Dashboard shows only the count per unit.
import type { ReducedProject } from "@/features/projects/types";
import type { LedgerInput } from "./types";

export function stalledOf(projects: readonly ReducedProject[], unitOfCase: (caseId: string) => string | null): LedgerInput["stalled"] {
  return projects
    .filter((p) => p.status !== "stopped" && p.escalated !== null && p.escalated.what === "stalled")
    .map((p) => ({ projectId: p.id, unitId: p.sources[0] === undefined ? null : unitOfCase(p.sources[0]) }));
}
