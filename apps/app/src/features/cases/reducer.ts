// reduce(seed, log) -> { day, cases, ideas, problems, ledger }. Port of legacy/demo/js/store.js.
//
// Nothing mutates the seed. Every count, clock and status on the page is derived from
// seed + events at render time; a backend later just becomes another place the same events
// come from. Pure: never reads the DOM, never touches storage. Only Kevin changes this file.
//
// Time: `log.day` is the demo clock, 0 = today. Seed cases carry `raisedDay` as a negative
// offset; age = day - raisedDay. A paused clock (question sent) does not count towards the promise.
import type { CaseEvent, CaseKind, EventLog } from "./events";
import type { Idea, Problem, Route, SeedCase } from "@/features/demo/types";

export type Decision = { answer: "yes" | "no"; reason: string; note: string; by: string; day: number };
export type HandOver = { from: string; to: string; why: string; day: number };
export type Answer = { text: string; by: string; day: number };
export type Question = { text: string; by: string; day: number; answer: Answer | null };
export type Building = { day: number; days: number; expected: string; by: string };
export type Shipped = { day: number; outcome: string; outcomeNote: string; by: string };
export type Override = { proposed: string | null; chosen: string; day: number; by: string };
// The promise rule (§11): miss the date and it moves to the deputy automatically. `live` = it
// crossed the line during this demo session (day 0 or later) - what the manager's ledger counts.
export type Escalation = { to: string; from: string; day: number; live: boolean };
export type CaseStatus = "open" | "decided" | "asked" | "building" | "shipped";

export type ReducedCase = {
  id: string; seed: boolean; kind: CaseKind; title: string; body: string; from: string; fromDept: string;
  routeId: string | null; assignee: string; raisedDay: number; reason: string; upside: string; linkedIdea: string | null;
  status: CaseStatus; read: number | null; decided: Decision | null; question: Question | null; handed: HandOver[];
  building: Building | null; shipped: Shipped | null; override: Override | null;
  pausedDays: number; pausedSince: number | null; history: CaseEvent[];
  // derived once every event is applied
  route: Route | null; age: number; clock: number; open: boolean; overdue: boolean; dueDay: number; escalated: Escalation | null;
};

export type Cosign = { name: string; day: number };
export type IdeaQuestion = { text: string; by: string; day: number; answer: null };
export type Approval = { by: string; day: number; note: string; funded: boolean };
export type ReducedIdea = Idea & { cosigners: Cosign[]; thread: IdeaQuestion[]; approved: Approval | null; seedWait: number };
export type ReducedProblem = Problem;

export type LedgerCounts = { handedOver: number; escalated: number; overrides: number };
export type State = { day: number; cases: ReducedCase[]; ideas: ReducedIdea[]; problems: ReducedProblem[]; ledger: LedgerCounts };

export type ReduceSeed = { cases: SeedCase[]; ideas: Idea[]; problems: Problem[]; routes: Route[]; promiseDays: number };

type CaseRow = { kind?: CaseKind; title: string; body?: string; from: string; fromDept?: string; routeId?: string | null; assignee: string; raisedDay?: number; reason?: string; upside?: string; linkedIdea?: string };

export function reduce(seed: ReduceSeed, log: EventLog): State {
  const day = log.day | 0;
  const routes = seed.routes;
  const routeOf = (id: string | null) => routes.find((r) => r.id === id) ?? null;

  const cases: Record<string, ReducedCase> = {};
  const order: string[] = [];
  const ideas: Record<string, ReducedIdea> = {};
  const problems: Record<string, ReducedProblem> = {};

  const freshCase = (id: string, row: CaseRow, isSeed: boolean): ReducedCase => {
    const c: ReducedCase = {
      id, seed: isSeed, kind: row.kind ?? "problem", title: row.title, body: row.body ?? "", from: row.from, fromDept: row.fromDept ?? "",
      routeId: row.routeId ?? null, assignee: row.assignee, raisedDay: row.raisedDay ?? 0,
      reason: row.reason ?? "", upside: row.upside ?? "", linkedIdea: row.linkedIdea ?? null,
      status: "open", read: null, decided: null, question: null, handed: [], building: null, shipped: null,
      override: null, pausedDays: 0, pausedSince: null, history: [],
      route: null, age: 0, clock: 0, open: true, overdue: false, dueDay: 0, escalated: null,
    };
    cases[id] = c;
    order.push(id);
    return c;
  };

  seed.cases.forEach((row) => freshCase(row.id, row, true));
  // An idea that is still waiting keeps waiting as the demo clock advances.
  seed.ideas.forEach((i) => {
    ideas[i.id] = { ...i, team: i.team.slice(), cosigners: [], thread: [], approved: null,
      wait: i.status === "Awaiting decision" ? i.wait + day : i.wait, seedWait: i.wait };
  });
  seed.problems.forEach((p) => { problems[p.id] = { ...p }; });

  // Seed history first (in day order), then live events (in log order).
  const seedEvents: CaseEvent[] = [];
  const pushSeed = (target: string) => (ev: NonNullable<SeedCase["seedEvents"]>[number], k: number) =>
    seedEvents.push({ id: "seed_" + target + "_" + k, ts: 0, target, seed: true, type: ev.type, day: ev.day, actor: ev.actor, payload: ev.payload ?? {} });
  seed.cases.forEach((row) => (row.seedEvents ?? []).forEach(pushSeed(row.id)));
  seed.ideas.forEach((row) => (row.seedEvents ?? []).forEach(pushSeed(row.id)));
  seedEvents.sort((a, b) => a.day - b.day);

  const apply = (ev: CaseEvent) => {
    const pl = ev.payload ?? {};
    const d = ev.day | 0;
    const target = ev.target ?? "";
    switch (ev.type) {
      case "case.raised": {
        const c = freshCase(target, { kind: pl.kind, title: pl.title ?? "Untitled", body: pl.body, from: ev.actor, fromDept: pl.fromDept, routeId: pl.routeId, assignee: pl.assignee ?? "Triage desk", raisedDay: d, reason: pl.reason ?? "triage", upside: pl.upside ?? "" }, false);
        c.history.push(ev);
        break;
      }
      case "case.read": {
        const c = cases[target];
        if (!c || c.read !== null) break;
        c.read = d;
        c.history.push(ev);
        break;
      }
      case "case.decided": {
        const c = cases[target];
        if (!c) break;
        if (c.read === null) c.read = d;
        if (c.pausedSince !== null) { c.pausedDays += d - c.pausedSince; c.pausedSince = null; }
        c.decided = { answer: pl.answer === "no" ? "no" : "yes", reason: pl.reason ?? "", note: pl.note ?? "", by: ev.actor, day: d };
        c.status = "decided";
        c.history.push(ev);
        break;
      }
      case "case.handed": {
        const c = cases[target];
        if (!c || c.status !== "open" || !pl.to) break;
        if (c.read === null) c.read = d;
        c.handed.push({ from: ev.actor, to: pl.to, why: pl.why ?? "", day: d });
        c.assignee = pl.to;
        c.history.push(ev);
        break;
      }
      case "case.asked": {
        const c = cases[target];
        if (!c || c.status !== "open") break;
        if (c.read === null) c.read = d;
        c.question = { text: pl.text ?? "", by: ev.actor, day: d, answer: null };
        c.status = "asked";
        c.pausedSince = d;
        c.history.push(ev);
        break;
      }
      case "case.answered": {
        const c = cases[target];
        if (!c || c.status !== "asked" || !c.question) break;
        c.question.answer = { text: pl.text ?? "", by: ev.actor, day: d };
        c.pausedDays += d - (c.pausedSince ?? d);
        c.pausedSince = null;
        c.status = "open";
        c.history.push(ev);
        break;
      }
      case "case.building": {
        const c = cases[target];
        if (!c) break;
        c.building = { day: d, days: pl.days ?? 30, expected: pl.expected ?? "", by: ev.actor };
        c.status = "building";
        c.history.push(ev);
        break;
      }
      case "case.shipped": {
        const c = cases[target];
        if (!c) break;
        c.shipped = { day: d, outcome: pl.outcome ?? "", outcomeNote: pl.outcomeNote ?? "", by: ev.actor };
        c.status = "shipped";
        c.history.push(ev);
        break;
      }
      case "case.override": {
        const c = cases[target];
        if (!c || !pl.chosen) break;
        const chosen = routeOf(pl.chosen);
        c.override = { proposed: pl.proposed ?? c.routeId, chosen: pl.chosen, day: d, by: ev.actor };
        if (chosen) { c.routeId = chosen.id; c.assignee = chosen.owner.name; }
        c.history.push(ev);
        break;
      }
      case "idea.cosigned": {
        const i = ideas[target];
        if (!i) break;
        if (!i.cosigners.some((x) => x.name === ev.actor)) i.cosigners.push({ name: ev.actor, day: d });
        break;
      }
      case "idea.uncosigned": {
        const i = ideas[target];
        if (!i) break;
        i.cosigners = i.cosigners.filter((x) => x.name !== ev.actor);
        break;
      }
      case "idea.asked": {
        const i = ideas[target];
        if (!i) break;
        i.thread.push({ text: pl.text ?? "", by: ev.actor, day: d, answer: null });
        break;
      }
      case "idea.approved":
      case "idea.funded": {
        const i = ideas[target];
        if (!i) break;
        i.approved = { by: ev.actor, day: d, note: pl.note ?? "", funded: ev.type === "idea.funded" };
        i.status = "In trial";
        i.wait = 0;
        if (pl.team && pl.team.length) i.team = pl.team.slice();
        const p = problems[i.problem];
        if (p && p.owner !== "trial") p.owner = "trial";
        break;
      }
      case "day.advanced":
        break; // the day is tracked on the log itself
      default:
        break;
    }
  };

  seedEvents.forEach(apply);
  log.events.forEach(apply);

  // Derived per case: age, clock, overdue, escalation, last action.
  const promise = seed.promiseDays || 5;
  order.forEach((id) => {
    const c = cases[id];
    const route = routeOf(c.routeId);
    c.route = route;
    c.age = day - c.raisedDay;
    const stopDay = c.decided ? c.decided.day : c.building ? c.building.day : c.shipped ? c.shipped.day : null;
    const paused = c.pausedDays + (c.pausedSince !== null ? day - c.pausedSince : 0);
    c.clock = Math.max(0, (stopDay !== null ? stopDay : day) - c.raisedDay - paused);
    c.open = c.status === "open";
    c.overdue = c.open && c.clock > promise;
    c.dueDay = c.raisedDay + promise + paused;
    // The route's owner takes it if the case sat with someone else, otherwise the owner's deputy.
    // The original owner keeps it too - both can act.
    const to = route ? (route.owner.name === c.assignee ? route.deputy : route.owner.name) : null;
    c.escalated = c.overdue && to ? { to, from: c.assignee, day: c.dueDay + 1, live: c.dueDay + 1 >= 0 } : null;
  });

  const ledger: LedgerCounts = {
    handedOver: order.reduce((a, id) => a + cases[id].handed.length, 0),
    escalated: order.reduce((a, id) => a + (cases[id].escalated?.live ? 1 : 0), 0),
    overrides: order.reduce((a, id) => a + (cases[id].override ? 1 : 0), 0),
  };

  return {
    day,
    cases: order.map((id) => cases[id]),
    ideas: seed.ideas.map((i) => ideas[i.id]),
    problems: seed.problems.map((p) => problems[p.id]),
    ledger,
  };
}
