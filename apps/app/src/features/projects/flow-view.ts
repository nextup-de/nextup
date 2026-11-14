import type { ReducedProject, StepColumn } from "./types";

const COLUMNS = ["todo", "doing", "blocked"] as const;
export type ColumnTime = { column: typeof COLUMNS[number]; medianDays: number | null; count: number };
const isColumn = (value: unknown): value is StepColumn => value === "todo" || value === "doing" || value === "blocked" || value === "done";

/** Completed stays only: a reorder is not a new stay, and an open stay has no end date yet.
 * A step that returns to a column contributes another completed stay. Dropped steps never count.
 */
export function timePerColumn(p: Pick<ReducedProject, "steps" | "history">): ColumnTime[] {
  const samples: Record<typeof COLUMNS[number], number[]> = { todo: [], doing: [], blocked: [] };
  for (const step of p.steps) {
    if (step.dropped) continue;
    const added = p.history.find((e) => e.type === "project.step.added" && e.payload.stepId === step.id);
    // Seeded steps may have no added event; their original column is To do.
    const initialColumn = added?.payload.to;
    let column: StepColumn = isColumn(initialColumn) && initialColumn !== "blocked" ? initialColumn : "todo";
    let since = step.addedDay;
    for (const event of p.history) {
      const nextColumn = event.payload.to;
      if (event.type !== "project.step.moved" || event.payload.stepId !== step.id || !isColumn(nextColumn) || event.day < since) continue;
      if (nextColumn === column) continue;
      if (column !== "done") samples[column].push(event.day - since);
      column = nextColumn;
      since = event.day;
    }
  }
  return COLUMNS.map((column) => {
    const days = samples[column].sort((a, b) => a - b);
    const middle = Math.floor(days.length / 2);
    const medianDays = days.length === 0 ? null : days.length % 2 ? days[middle] : (days[middle - 1] + days[middle]) / 2;
    return { column, medianDays, count: days.length };
  });
}
