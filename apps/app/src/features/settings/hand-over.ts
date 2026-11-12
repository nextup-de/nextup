// The hand-over of a new stack to the customer's IT (Q8.6, block S #660). Pure: the facts come from the
// audit trail (audit.setup.handed_over) and the setup overview, this file decides. Nothing is stored but
// the audit row, which says when and how the confirming person came into the console.
import type { PhaseStatus } from "./setup-phases";

/** How the confirming person came into the console. Break-glass and support are NextUp's ways in, not IT's. */
export type HandOverBy = "entra" | "stack-admin";
export const HAND_OVER_BY: readonly HandOverBy[] = ["entra", "stack-admin"];

export type HandOver = { at: Date; by: HandOverBy };

/**
 * What /admin/setup shows. `done`: when and by whom. `ready`: the server phase is checked, this viewer may
 * confirm. `notYet`: the server phase is not checked yet. `notYours`: someone else's way in (break-glass,
 * support) sees that it is open, without a button.
 */
export type HandOverState =
  | { kind: "done"; at: string; by: HandOverBy }
  | { kind: "ready" }
  | { kind: "notYet" }
  | { kind: "notYours" };

export function canConfirmHandOver(via: string | null | undefined): via is HandOverBy {
  return (HAND_OVER_BY as readonly string[]).includes(via ?? "");
}

export function handOverState(f: { handedOver: HandOver | null; server: PhaseStatus | null; via: string | null }): HandOverState {
  if (f.handedOver) return { kind: "done", at: f.handedOver.at.toISOString(), by: f.handedOver.by };
  if (!canConfirmHandOver(f.via)) return { kind: "notYours" };
  return f.server === "done" ? { kind: "ready" } : { kind: "notYet" };
}

/** The hand-over an audit row records, or null when the row does not say how the person came in. */
export function handOverOf(row: { at: Date; changes: unknown } | null): HandOver | null {
  if (!row) return null;
  const after = (row.changes as { by?: { after?: unknown } } | null)?.by?.after;
  const by = typeof after === "string" ? after : null;
  return canConfirmHandOver(by) ? { at: row.at, by } : null;
}
