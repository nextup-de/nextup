// The conversation between whoever raised a case and whoever holds it (the dashboard's chat panel):
// each question and answer, the decision, every hand-over and escalation, and what the two sides
// wrote under it. Facts from the case history and the log, in order; the panel turns them into
// bubbles. Comments from anyone else belong to the feed; new information (rescore) to the case.
// Who is on a side is decided by user id (IDN/D2); the names are only what the panel shows.
import type { SeatRow } from "@/features/auth/identity";
import type { EventLog } from "./events";
import type { ReducedCase } from "./reducer";
import { commentsOn } from "./selectors";

export type ThreadEntry =
  | { t: "asked" | "answered" | "said"; id: string; by: string; byUserId: string | null; text: string; day: number }
  | { t: "decided"; id: string; by: string; byUserId: string | null; answer: "yes" | "no"; reason: string; note: string; day: number }
  | { t: "handed"; id: string; by: string; byUserId: string | null; to: string; why: string; day: number; auto: boolean };

export type DeskPerson = { userId: string; name: string };

// Everyone who has held the case, or spoken for the desk on it, once each by user id; the raiser is not among them.
// A seat nobody holds, or a step without an id, names no one.
export function deskPeople(c: ReducedCase, seats: readonly SeatRow[] = []): DeskPerson[] {
  const out: DeskPerson[] = [];
  const add = (userId: string | null | undefined, name: string) => {
    if (!userId || userId === c.fromUserId || out.some((p) => p.userId === userId)) return;
    out.push({ userId, name });
  };
  const seat = (id: string | null) => { const s = id === null ? undefined : seats.find((x) => x.id === id); if (s) add(s.userId, s.label); };
  seat(c.assigneeSeatId);
  for (const h of c.handed) { add(h.fromUserId, h.from); seat(h.toSeatId); }
  if (c.escalated) seat(c.escalated.toSeatId);
  for (const e of c.history) if (e.type === "case.asked" || e.type === "case.decided") add(e.actorUserId, e.actor);
  return out;
}

export function deskThread(c: ReducedCase, log: EventLog, seats: readonly SeatRow[] = []): ThreadEntry[] {
  // [place in the log, the entry] - the log's order breaks ties within a day; seed history comes first.
  const at = new Map(log.events.map((e, i) => [e.id, i]));
  const out: [number, ThreadEntry][] = [];
  for (const e of c.history) {
    const p = e.payload, base = { id: e.id, by: e.actor, byUserId: e.actorUserId ?? null, day: e.day }, i = at.get(e.id) ?? -1;
    if (e.type === "case.asked") out.push([i, { ...base, t: "asked", text: p.text ?? "" }]);
    else if (e.type === "case.answered") out.push([i, { ...base, t: "answered", text: p.text ?? "" }]);
    else if (e.type === "case.decided") out.push([i, { ...base, t: "decided", answer: p.answer ?? "yes", reason: p.reason ?? "", note: p.note ?? "" }]);
    else if (e.type === "case.handed") out.push([i, { ...base, t: "handed", to: p.to ?? "", why: p.why ?? "", auto: false }]);
  }
  if (c.escalated) out.push([Number.MAX_SAFE_INTEGER, { t: "handed", id: "esc-" + c.id, by: c.escalated.from, byUserId: null, to: c.escalated.to, why: "", day: c.escalated.day, auto: true }]);
  const sides = new Set<string>(deskPeople(c, seats).map((p) => p.userId));
  if (c.fromUserId) sides.add(c.fromUserId);
  for (const m of commentsOn(log, c.id)) if (!m.rescore && m.byUserId && sides.has(m.byUserId)) out.push([at.get(m.id) ?? -1, { t: "said", id: m.id, by: m.by, byUserId: m.byUserId, text: m.text, day: m.day }]);
  return out.sort(([ia, a], [ib, b]) => a.day - b.day || ia - ib).map(([, e]) => e);
}
