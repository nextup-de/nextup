// Selectors over the reduced state. Port of the selector half of legacy/demo/js/store.js.
// A case is one object seen from three sides: `from` = whose "My cases", `assignee` = whose
// inbox (a hand-over changes it), an escalation puts it on a second desk too.
import type { Route } from "@/features/demo/types";
import type { EventLog } from "./events";
import type { ReducedCase, ReducedIdea, State } from "./reducer";

export type Acted = "decided" | "handed" | "asked";

export const onDesk = (c: ReducedCase, name: string) => c.assignee === name || c.escalated?.to === name;
export const inboxFor = (state: State, name: string) => state.cases.filter((c) => onDesk(c, name) && c.open);
export const mineFor = (state: State, handle: string | null) => state.cases.filter((c) => c.from === handle);
export const cosignedBy = (state: State, handle: string | null): ReducedIdea[] =>
  state.ideas.filter((i) => i.cosigners.some((x) => x.name === handle));

// What did `name` last do to this case that took it off their desk?
// A question only counts while it is still unanswered - once the sender replies the case is back on the desk.
export function actedBy(c: ReducedCase, name: string): Acted | null {
  for (let k = c.history.length - 1; k >= 0; k--) {
    const ev = c.history[k];
    if (ev.actor !== name) continue;
    if (ev.type === "case.decided") return "decided";
    if (ev.type === "case.handed") return "handed";
    if (ev.type === "case.asked") return c.status === "asked" ? "asked" : null;
  }
  return null;
}

// Open cases on someone's desk: live ones plus the ones paused on a question.
export const deskFor = (state: State, name: string) => state.cases.filter((c) => onDesk(c, name) && (c.open || c.status === "asked"));

// Everyone who currently has, or could act on, a case: route owners plus whoever holds one right
// now (hand-overs, escalations). For the dev panel's "inbox of ...".
export function deskHolders(state: State, routes: readonly Route[]): string[] {
  const names: string[] = [];
  const add = (n: string | undefined) => { if (n && !names.includes(n)) names.push(n); };
  routes.forEach((r) => add(r.owner.name));
  state.cases.forEach((c) => { if (c.open || c.status === "asked") { add(c.assignee); if (c.escalated) add(c.escalated.to); } });
  return names;
}

export const clearedBy = (state: State, name: string) => state.cases.filter((c) => actedBy(c, name) !== null);

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
export type Affected = { name: string; day: number; why?: string };
export type Comment = { id: string; by: string; text: string; day: number; rescore: boolean };

export function affectedOn(log: EventLog, caseId: string): Affected[] {
  const out: Affected[] = [];
  for (const e of log.events) {
    if (e.target !== caseId) continue;
    if (e.type === "case.affected" && !out.some((a) => a.name === e.actor)) out.push({ name: e.actor, day: e.day, why: e.payload.why?.trim() || undefined });
    if (e.type === "case.unaffected") { const i = out.findIndex((a) => a.name === e.actor); if (i >= 0) out.splice(i, 1); }
  }
  return out;
}

export const commentsOn = (log: EventLog, caseId: string): Comment[] =>
  log.events.filter((e) => e.target === caseId && e.type === "case.commented").map((e) => ({ id: e.id, by: e.actor, text: e.payload.text ?? "", day: e.day, rescore: !!e.payload.rescore }));

// New information posted since the case was raised - each one re-evaluates the score (scoring: `updates`).
export const rescoresOn = (log: EventLog, caseId: string): Comment[] => commentsOn(log, caseId).filter((m) => m.rescore);
