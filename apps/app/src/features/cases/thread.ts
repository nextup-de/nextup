// The conversation between whoever raised a case and whoever holds it (the dashboard's chat panel):
// each question and answer, the decision, every hand-over and escalation, and what the two sides
// wrote under it. Facts from the case history and the log, in order; the panel turns them into
// bubbles. Comments from anyone else belong to the feed; new information (rescore) to the case.
import type { EventLog } from "./events";
import type { ReducedCase } from "./reducer";
import { commentsOn } from "./selectors";

export type ThreadEntry =
  | { t: "asked" | "answered" | "said"; id: string; by: string; text: string; day: number }
  | { t: "decided"; id: string; by: string; answer: "yes" | "no"; reason: string; note: string; day: number }
  | { t: "handed"; id: string; by: string; to: string; why: string; day: number; auto: boolean };

// Everyone who has held the case, or spoken for the desk on it.
export function deskPeople(c: ReducedCase): string[] {
  const names = [c.assignee, ...c.handed.flatMap((h) => [h.from, h.to]), ...(c.escalated ? [c.escalated.to] : [])];
  for (const e of c.history) if (e.type === "case.asked" || e.type === "case.decided") names.push(e.actor);
  return [...new Set(names)].filter((n) => n !== c.from);
}

export function deskThread(c: ReducedCase, log: EventLog): ThreadEntry[] {
  // [place in the log, the entry] - the log's order breaks ties within a day; seed history comes first.
  const at = new Map(log.events.map((e, i) => [e.id, i]));
  const out: [number, ThreadEntry][] = [];
  for (const e of c.history) {
    const p = e.payload, base = { id: e.id, by: e.actor, day: e.day }, i = at.get(e.id) ?? -1;
    if (e.type === "case.asked") out.push([i, { ...base, t: "asked", text: p.text ?? "" }]);
    else if (e.type === "case.answered") out.push([i, { ...base, t: "answered", text: p.text ?? "" }]);
    else if (e.type === "case.decided") out.push([i, { ...base, t: "decided", answer: p.answer ?? "yes", reason: p.reason ?? "", note: p.note ?? "" }]);
    else if (e.type === "case.handed") out.push([i, { ...base, t: "handed", to: p.to ?? "", why: p.why ?? "", auto: false }]);
  }
  if (c.escalated) out.push([Number.MAX_SAFE_INTEGER, { t: "handed", id: "esc-" + c.id, by: c.escalated.from, to: c.escalated.to, why: "", day: c.escalated.day, auto: true }]);
  const sides = new Set([c.from, ...deskPeople(c)]);
  for (const m of commentsOn(log, c.id)) if (!m.rescore && sides.has(m.by)) out.push([at.get(m.id) ?? -1, { t: "said", id: m.id, by: m.by, text: m.text, day: m.day }]);
  return out.sort(([ia, a], [ib, b]) => a.day - b.day || ia - ib).map(([, e]) => e);
}
