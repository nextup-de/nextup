// The event log. Append-only facts; the reducer turns seed + events into what the page shows.
// Port of legacy/demo/js/store.js - types here, reducer in reducer.ts, selectors in selectors.ts.
// Never store display text as state: store who / which day / which route; build sentences at render.
export type CaseEventType =
  | "case.raised" // { title, body, routeId, assignee, fromDept, kind?, reason?, upside?, affected?, attachments?, proposal?, visibility?, seenBy? }
  | "case.read" // -
  | "case.decided" // { answer: 'yes'|'no', reason?, note?, projectId?, lead?, title? }  a yes with projectId opens (or joins) that project
  | "case.discussion" // { invited, missing }  "Discuss first": round 1 starts (docs/plans/2026-10-15_idea-to-project.md)
  | "case.invited" // { invited }  more people asked for their view
  | "case.revised" // { body, title?, overall? }  the raiser's next version; the reducer numbers it
  | "case.checkin" // { next: 'round'|'decide', open, note }  ends a round
  | "case.handed" // { to, why? }
  | "case.asked" // { text }
  | "case.answered" // { text }
  | "case.building" // { days, expected? }            (seed history)
  | "case.shipped" // { outcome, outcomeNote }        (seed history)
  | "case.override" // { proposed, chosen }  (route ids)
  | "case.affected" // { why? }  the actor says the problem hits them too - a lead says why (read from the log by selectors; the reducer ignores it)
  | "case.unaffected" // - withdraws that
  | "case.commented" // { text, rescore? }  rescore: the text is new information and corrects the score
  | "idea.cosigned" // -
  | "idea.uncosigned" // -
  | "idea.asked" // { text }
  | "idea.approved" // { team?: [names], note? }
  | "idea.funded" // { team?: [names], note? }
  // A project, target = its id. It opens with the case.decided yes above, never with an event of its own.
  | "project.member" // { name, on }
  | "project.handed" // { to, why? }  a new lead; the old one stays on the team
  | "project.baseline" // { metric, unit, value, better: 'up'|'down', source } or { none: true, why }
  | "project.started" // -  refused without a baseline
  | "project.step.added" // { stepId, text, owner?, dueDay?, external? }
  | "project.step.moved" // { stepId, to: 'todo'|'doing'|'blocked'|'done', why? }
  | "project.linked" // { system, url, key?, stepId? }
  | "project.commented" // { text }
  | "project.done" // { note? }  the measure checks start counting
  | "project.measured" // { check, value, source, note? }  the verdict is computed, never sent
  | "project.rewarded" // { rule, amount?, note? }
  | "project.claimed" // -  an anonymous author takes their reward
  | "project.stopped" // { why }
  | "day.advanced"; // { by }

// What an employee raises: something that hurts, or something that could be. Missing = problem.
export type CaseKind = "problem" | "idea";

// Who the raiser lets see it in the lists: the whole company, only them and the desk it lands on,
// or those plus the people and departments in seenBy. Missing = the old rule (derive.visibleTo).
// Applied in the browser only for now: the events endpoint still sends every event to every viewer.
export type Visibility = "everyone" | "private" | "custom";

// What the router proposed when the case was raised, kept so /admin/decisions can compare it with
// what people then chose (docs/COMPANY_KNOWLEDGE.md). The reducer never reads it.
export type RouteProposal = {
  routeId: string | null;
  confidence: number; // 0-100
  source: "keywords" | "llm";
  version: string; // which matcher or prompt - features/routing ROUTER_VERSION
};

// Every field an event may carry. Which ones apply is documented per type above.
export type EventPayload = {
  title?: string; body?: string; routeId?: string | null; assignee?: string; fromDept?: string; kind?: CaseKind; reason?: string; upside?: string;
  answer?: "yes" | "no"; note?: string;
  to?: string; why?: string;
  text?: string;
  days?: number; expected?: string;
  outcome?: string; outcomeNote?: string;
  proposed?: string | null; chosen?: string;
  team?: string[];
  affected?: string[]; // names the raiser says are hit by the problem too
  attachments?: number; // screenshots attached when raised (the files stay in the browser; only the count is a fact)
  rescore?: boolean; // on case.commented: the comment is new information, the score is re-evaluated with it
  by?: number;
  proposal?: RouteProposal; // on case.raised
  visibility?: Visibility; // on case.raised
  seenBy?: string[]; // on case.raised with visibility "custom": people and department names
  // The discussion stage
  invited?: string[]; // case.discussion, case.invited: names
  missing?: string; // case.discussion: what is still missing, in the desk holder's words
  overall?: number; // case.revised: the benchmark score of the new version, 0-100
  next?: "round" | "decide"; // case.checkin
  open?: string[]; // case.checkin: the points still open (dial names or short notes)
  // Projects
  projectId?: string; // case.decided yes: the project it opens or joins
  lead?: string; // case.decided yes: who leads it
  name?: string; on?: boolean; // project.member
  metric?: string; unit?: string; value?: number; better?: "up" | "down"; source?: string; none?: boolean; // project.baseline, project.measured (value, source)
  stepId?: string; owner?: string; dueDay?: number; // project.step.*, project.linked (stepId)
  external?: { system: string; key: string; url?: string }; // project.step.added from a connector
  system?: string; url?: string; key?: string; // project.linked
  check?: number; // project.measured: days after done (30, 90)
  rule?: string; amount?: number; // project.rewarded
};

export type CaseEvent = {
  id: string;
  ts: number;
  day: number; // demo clock when it happened, 0 = today; seed history is negative
  type: CaseEventType;
  actor: string;
  target: string | null; // case id, idea id, or null (day.advanced)
  payload: EventPayload;
  seed?: boolean; // history that already happened before day 0 (from the seed rows)
};

// History carried on a seed row; the reducer applies it before live events.
export type SeedEvent = { type: CaseEventType; day: number; actor: string; payload?: EventPayload };

// The log: the events that happened in this browser plus the demo clock.
export type EventLog = { events: CaseEvent[]; day: number };

export const emptyLog = (): EventLog => ({ events: [], day: 0 });

let seq = 0;
export const newId = (prefix: string) => prefix + "_" + Date.now().toString(36) + (seq++).toString(36);

export type NewEvent = { type: CaseEventType; actor: string; target: string | null; payload?: EventPayload };

// Append one event. Returns a new log; the old one is untouched. day.advanced moves the clock.
export function appendEvent(log: EventLog, ev: NewEvent): EventLog {
  const e: CaseEvent = { id: newId("e"), ts: Date.now(), day: log.day, ...ev, payload: ev.payload ?? {} };
  const day = ev.type === "day.advanced" ? log.day + (ev.payload?.by ?? 1) : log.day;
  return { events: log.events.concat([e]), day };
}
