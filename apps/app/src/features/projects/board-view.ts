import { STEP_COLUMNS, type Step, type StepColumn } from "./types";

export type BoardTarget = { column: StepColumn; ownerUserId?: string | null; before?: string | null; allowed?: boolean };
export type BoardLane = {
  id: string; ownerUserId: string | null; owner: string | null;
  columns: Record<StepColumn, Step[]>; count: number;
};

/** Keep priority order and identity; labels never decide which lane owns a card. */
export function boardLanes(steps: readonly Step[], { groupBy }: { groupBy: "status" | "person" }): BoardLane[] {
  const lane = (ownerUserId: string | null, owner: string | null): BoardLane => ({
    id: ownerUserId ?? "unowned", ownerUserId, owner,
    columns: { todo: [], doing: [], blocked: [], done: [] }, count: 0,
  });
  const lanes = groupBy === "status" ? [lane(null, null)] : [];
  if (groupBy === "person") {
    for (const step of steps) {
      if (step.ownerUserId && !lanes.some((l) => l.ownerUserId === step.ownerUserId)) lanes.push(lane(step.ownerUserId, step.owner));
    }
    lanes.push(lane(null, null));
  }
  for (const step of steps) {
    const target = groupBy === "status" ? lanes[0] : lanes.find((l) => l.ownerUserId === (step.ownerUserId ?? null))!;
    target.columns[step.column].push(step);
    if (!step.dropped) target.count++;
  }
  return lanes;
}

/** A blocked drop never writes before the waiting-on form has been completed. */
export function dropOutcome(step: Step, target: BoardTarget): "move" | "reassign" | "ask-blocked" | "refused" {
  if (target.allowed === false || step.dropped || !STEP_COLUMNS.includes(target.column)) return "refused";
  if (target.column === "done" && step.checklist.some((item) => !item.done)) return "refused";
  if (target.column === "blocked" && step.column !== "blocked") return "ask-blocked";
  if (target.ownerUserId !== undefined && (step.ownerUserId ?? null) !== target.ownerUserId) return "reassign";
  return "move";
}
