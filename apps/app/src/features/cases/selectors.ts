// Selectors over the reduced state. Port of the selector half of legacy/demo/js/store.js.
// A case is one object seen from three sides: `from` = whose "My cases", `assignee` = whose
// inbox (a hand-over changes it), an escalation puts it on a second desk too.
import { holdsRole, type Me } from "@/features/auth/identity";
import type { SeatRow } from "@/features/auth/identity";
import type { NoticeChannel } from "./notice";
import { byNotice } from "@/features/notify/notice-actor";
import type { EventLog } from "./events";
import type { ReducedCase, ReducedIdea, State } from "./reducer";

export type Acted = "decided" | "handed" | "asked";

// By id (IDN/D8): a case sits on one seat; everyone who holds that seat's role (or the escalated-to role) has it.
export const onDeskOf = (c: ReducedCase, me: Me): boolean => holdsRole(me, c.assigneeRoleId) || holdsRole(me, c.escalated?.toRoleId ?? null);
export const inboxOf = (state: State, me: Me) => state.cases.filter((c) => onDeskOf(c, me) && c.open);
export const mineOf = (state: State, me: Me) => state.cases.filter((c) => me.userId !== null && c.fromUserId === me.userId);
export const cosignedOf = (state: State, me: Me): ReducedIdea[] =>
  state.ideas.filter((i) => me.userId !== null && i.cosigners.some((x) => x.userId === me.userId));

// What did this person last do to the case that took it off their desk? Same rule as actedBy, by user id.
export function actedByMe(c: ReducedCase, me: Me): Acted | null {
  if (me.userId === null) return null;
  for (let k = c.history.length - 1; k >= 0; k--) {
    const ev = c.history[k];
    if (ev.actorUserId !== me.userId) continue;
    if (ev.type === "case.decided") return "decided";
    if (ev.type === "case.handed") return "handed";
    if (ev.type === "case.asked") return c.status === "asked" ? "asked" : null;
  }
  return null;
}

export const deskOf = (state: State, me: Me) => state.cases.filter((c) => onDeskOf(c, me) && (c.open || c.status === "asked"));
export const clearedByMe = (state: State, me: Me) => state.cases.filter((c) => actedByMe(c, me) !== null);

// The seats that hold an open or asked case (or its escalation), in the order the seats are listed.
export function deskSeats(state: State): SeatRow[] {
  const held = new Set<string>();
  state.cases.forEach((c) => {
    if (!(c.open || c.status === "asked")) return;
    if (c.assigneeSeatId) held.add(c.assigneeSeatId);
    if (c.escalated?.toSeatId) held.add(c.escalated.toSeatId);
  });
  return state.seats.filter((s) => held.has(s.id));
}

// Session-created cases as seed rows (with their history as seedEvents), for pasting into seed.ts.
export function exportSnippet(state: State): string {
  const rows = state.cases.filter((c) => !c.seed).map((c) => {
    const raised = c.history.find((e) => e.type === "case.raised");
    const row: Record<string, unknown> = {
      id: c.id, title: c.title, body: c.body, from: c.from, fromDept: c.fromDept, routeId: c.routeId,
      assignee: c.handed.length && raised ? raised.payload.assignee : c.assignee,
      raisedDay: c.raisedDay - state.day, reason: c.reason, upside: c.upside,
    };
    const evs = c.history.filter((e) => e.type !== "case.raised").map((e) => ({ type: e.type, day: e.day - state.day, actor: e.actor, payload: e.payload }));
    if (evs.length) row.seedEvents = evs;
    return "  " + JSON.stringify(row).replace(/"(\w+)":/g, "$1: ").replace(/,/g, ", ");
  });
  return rows.length ? "// paste into CASES in src/features/demo/seed.ts\n" + rows.join(",\n") + "," : "";
}

// Read straight from the log - these events do not change a case's state, so the reducer leaves
// them alone; they are facts about who stands behind a case and what was said under it.
export type Affected = { name: string; userId: string | null; day: number; why?: string };
/** `notice`: on the raise notice's note (by system:mail), the channel that carried it; null on any other comment. */
export type Comment = { id: string; by: string; byUserId?: string | null; text: string; day: number; rescore: boolean; notice?: NoticeChannel | null };

export function affectedOn(log: EventLog, caseId: string): Affected[] {
  const out: Affected[] = [];
  for (const e of log.events) {
    if (e.target !== caseId) continue;
    const uid = e.actorUserId ?? null;
    // By user id; an event without one is its own entry and can never be withdrawn.
    if (e.type === "case.affected" && (uid === null || !out.some((a) => a.userId === uid))) out.push({ name: e.actor, userId: uid, day: e.day, why: e.payload.why?.trim() || undefined });
    if (e.type === "case.unaffected" && uid !== null) { const i = out.findIndex((a) => a.userId === uid); if (i >= 0) out.splice(i, 1); }
  }
  return out;
}

export const commentsOn = (log: EventLog, caseId: string): Comment[] =>
  log.events.filter((e) => e.target === caseId && e.type === "case.commented").map((e) => ({ id: e.id, by: e.actor, byUserId: e.actorUserId ?? null, text: e.payload.text ?? "", day: e.day, rescore: !!e.payload.rescore,
    notice: byNotice(e) ? (e.payload.channel === "teams" ? "teams" : "mail") : null }));

// New information posted since the case was raised - each one re-evaluates the score (scoring: `updates`).
export const rescoresOn = (log: EventLog, caseId: string): Comment[] => commentsOn(log, caseId).filter((m) => m.rescore);
