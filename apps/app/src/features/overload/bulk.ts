// The people side of a loaded desk (plan OVL, D3, D20, D21, D28). Pure. `triageFor` says which of a person's desks are at triage or above, so the inbox
// shows its banner; `bulkEvents` builds the events of a bulk pass or ask, one per case, each the event a single pass or ask writes (no new event, D21);
// `deskRows` is what the Dashboard card shows: one row per desk the viewer may see, never a user id or a name (D3). A no is never an action in bulk (each
// needs its reason, NOR).
import type { Me } from "@/features/auth/identity";
import type { EventPayload } from "@/features/cases/events";
import type { State } from "@/features/cases/reducer";
import type { SeatAbove } from "@/features/clock/due";
import type { MessageKey } from "@/i18n";
import { mayShareLoad } from "./rights";
import type { DeskLevel, DeskLoad } from "./types";

/** What the inbox offers in bulk: pass cases on to one desk, or ask the authors one question. */
export type BulkAction = "pass" | "ask";

/** One desk of the viewer's that is at triage or above (D18), with the lines the banner says. */
export type TriageDesk = { roleId: string; open: number; late: number; level: Exclude<DeskLevel, "normal">; key: MessageKey; lateKey: MessageKey | null };

/**
 * The desks of this person at triage or above, busiest first (by the desk's own count, never by a person): the banner above their list. `key` is the line
 * that says triage the open items; `lateKey` is the line with the count of late ones, null when none is late.
 */
export function triageFor(loads: readonly DeskLoad[], me: Pick<Me, "roleIds">): TriageDesk[] {
  return loads
    .filter((l): l is DeskLoad & { level: TriageDesk["level"] } => l.level !== "normal" && me.roleIds.includes(l.roleId))
    .sort((a, b) => b.perHolder - a.perHolder || (a.roleId < b.roleId ? -1 : 1))
    .map((l) => ({ roleId: l.roleId, open: l.open, late: l.late, level: l.level, key: "overload.inbox.triage", lateKey: l.late > 0 ? "overload.inbox.triageLate" : null }));
}

/** One event of a bulk action: the same type and payload a single pass or ask writes. */
export type BulkEvent = { type: "case.handed" | "case.asked"; target: string; payload: EventPayload };
export type BulkInput = { why?: string; question?: string; toSeatId?: string; toLabel?: string };
export type BulkRefusal = { error: MessageKey };

const unique = (ids: readonly string[]): string[] => [...new Set(ids.filter((id) => typeof id === "string" && id !== ""))];

/**
 * The events of a bulk pass or ask: one per case, each with the one why (a hand-over to the picked seat) or the one question. An empty why, no target
 * seat or an empty question is refused with the sentence to show; anything but pass and ask - a no above all - is refused too. NOR's own rules (the
 * why's length, the pass limit, the seat) still apply to each case on the server, which reports the refused ones.
 */
export function bulkEvents(action: BulkAction | string, caseIds: readonly string[], input: BulkInput): BulkEvent[] | BulkRefusal {
  const ids = unique(caseIds);
  if (action === "pass") {
    const why = (input.why ?? "").trim();
    if (why === "") return { error: "shell.handSayWhy" };
    const seatId = input.toSeatId ?? "";
    if (seatId === "") return { error: "shell.handPick" };
    return ids.map((target) => ({ type: "case.handed", target, payload: { to: input.toLabel ?? "", toRoleHolderId: seatId, why } }));
  }
  if (action === "ask") {
    const question = (input.question ?? "").trim();
    if (question === "") return { error: "shell.typeQuestion" };
    return ids.map((target) => ({ type: "case.asked", target, payload: { text: question } }));
  }
  return { error: "overload.inbox.refused" };
}

/** One desk as the Dashboard card shows it: counts and the level of a role, and whether the viewer may share its load (D28). No user id, no name. */
export type DeskRow = { roleId: string; title: string; open: number; perHolder: number; late: number; pinned: number; level: DeskLevel; canShare: boolean };

type RowState = Pick<State, "cases" | "projects" | "seats" | "routes" | "rules" | "approvals" | "overload" | "day">;

/**
 * The desks this viewer may see (D3): the holders of the desk, the holder of the seat above it and the company's admins (app role manager); nobody else, so
 * a member who is none of these gets nothing. Sorted by the desk's title, never by a count. `canShare` is the rule of D28, asked of the same function the
 * server asks.
 */
export function deskRows(loads: readonly DeskLoad[], viewer: { userId: string | null; role: string }, state: RowState, above: SeatAbove): DeskRow[] {
  const admin = viewer.role === "manager";
  const mine = (roleId: string): boolean => viewer.userId !== null && state.seats.some((s) => s.roleId === roleId && s.userId === viewer.userId);
  const overMe = (roleId: string): boolean => {
    const up = above(roleId, []);
    return viewer.userId !== null && up !== null && state.seats.some((s) => s.id === up && s.userId === viewer.userId);
  };
  const titleOf = (roleId: string): string => state.approvals.roles.find((r) => r.id === roleId)?.title ?? roleId;
  const share = (roleId: string): boolean => viewer.userId !== null && mayShareLoad({ userId: viewer.userId, role: viewer.role }, roleId, state, state.day, above).ok;
  return loads
    .filter((l) => admin || mine(l.roleId) || overMe(l.roleId))
    .map((l): DeskRow => ({ roleId: l.roleId, title: titleOf(l.roleId), open: l.open, perHolder: l.perHolder, late: l.late, pinned: l.pinned, level: l.level, canShare: share(l.roleId) }))
    .sort((a, b) => a.title.localeCompare(b.title) || (a.roleId < b.roleId ? -1 : 1));
}
