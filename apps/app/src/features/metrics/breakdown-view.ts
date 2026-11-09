// Which breakdown rows the Dashboard shows (MET D11, D19). Pure. A row under MIN_GROUP people is left out, not
// greyed: the card only says how many are missing. A row with no case, nothing past its promise and nothing
// escalated is left out too, unless a unit under it has some; then it stays as a heading without figures.
import type { BreakdownRow } from "./types";

export type ShownRow = {
  row: BreakdownRow;
  /** The id of the shown unit this one sits under, or null at the top. */
  parentId: string | null;
  hasKids: boolean;
  /** False for a heading that is only there for the units under it. */
  figures: boolean;
};

const active = (r: BreakdownRow): boolean => !r.hidden && ((r.cases ?? 0) > 0 || (r.pastPromise ?? 0) > 0 || (r.escalated ?? 0) > 0);

/** The rows in tree order (depth gives the nesting), trimmed to what has something to say. */
export function shownRows(rows: readonly BreakdownRow[]): { rows: ShownRow[]; hidden: number } {
  const parent: (number | null)[] = [];
  const stack: number[] = [];
  rows.forEach((r, i) => {
    while (stack.length > 0 && rows[stack[stack.length - 1]].depth >= r.depth) stack.pop();
    parent.push(stack.length > 0 ? stack[stack.length - 1] : null);
    stack.push(i);
  });
  const keep = rows.map(active);
  for (let i = rows.length - 1; i >= 0; i--) {
    const p = parent[i];
    if (keep[i] && p !== null) keep[p] = true;
  }
  const kids = new Set(parent.filter((p, i): p is number => p !== null && keep[i]));
  const shown: ShownRow[] = [];
  rows.forEach((r, i) => {
    if (!keep[i]) return;
    const p = parent[i];
    shown.push({ row: r, parentId: p === null ? null : rows[p].id, hasKids: kids.has(i), figures: active(r) });
  });
  return { rows: shown, hidden: rows.filter((r) => r.hidden).length };
}
