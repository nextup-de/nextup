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
import { loopRules, type LoopRules } from "@/features/loop/rules";
import { applyProjectEvent, finishProjects, newBook, openOrJoin, seedProject } from "@/features/projects/reduce";
import type { ReducedProject, SeedProject } from "@/features/projects/types";

// A yes that names a project opens it (or adds this idea to it): the idea is archived from then on.
export type Decision = { answer: "yes" | "no"; reason: string; note: string; by: string; day: number; projectId?: string | null; lead?: string | null };
export type HandOver = { from: string; to: string; why: string; day: number };
export type Answer = { text: string; by: string; day: number };
export type Question = { text: string; by: string; day: number; answer: Answer | null };
export type Building = { day: number; days: number; expected: string; by: string };
export type Shipped = { day: number; outcome: string; outcomeNote: string; by: string };
export type Override = { proposed: string | null; chosen: string; day: number; by: string };
// The promise rule (§11): miss the date and it moves to the deputy automatically. `live` = it
// crossed the line during this demo session (day 0 or later) - what the manager's ledger counts.
export type Escalation = { to: string; from: string; day: number; live: boolean };
// The discussion stage (docs/plans/2026-10-15_idea-to-project.md): people are invited, the raiser
// revises, and every `discussEveryDays` a check-in ends the round - the next one or the decision.
export type CheckIn = { round: number; day: number; by: string; next: "round" | "decide"; open: string[]; note: string };
export type Discussion = {
  startedDay: number; by: string; invited: string[]; missing: string; rounds: CheckIn[];
  // derived: the round under way (the next check-in ends it), whether the last check-in said "decide",
  // and the day the last allowed round ends
  round: number; ready: boolean; lastDay: number;
};
// v1 is the case as raised; each case.revised adds the next one.
export type Version = { version: number; day: number; by: string; title: string; body: string; overall: number | null };
export type CaseStatus = "open" | "discussion" | "decided" | "asked" | "building" | "shipped";

export type ReducedCase = {
  id: string; seed: boolean; kind: CaseKind; title: string; body: string; from: string; fromDept: string;
  routeId: string | null; assignee: string; raisedDay: number; reason: string; upside: string; linkedIdea: string | null;
  status: CaseStatus; read: number | null; decided: Decision | null; question: Question | null; handed: HandOver[];
  building: Building | null; shipped: Shipped | null; override: Override | null;
  discussion: Discussion | null; versions: Version[];
  pausedDays: number; pausedSince: number | null; history: CaseEvent[];
  // derived once every event is applied. `open` = still on a desk, waiting for a move: open or in discussion.
  // `archived` = decided either way; a yes then lives on as `decided.projectId`.
  route: Route | null; age: number; clock: number; open: boolean; archived: boolean; overdue: boolean; dueDay: number; escalated: Escalation | null;
};

export type Cosign = { name: string; day: number };
export type IdeaQuestion = { text: string; by: string; day: number; answer: null };
export type Approval = { by: string; day: number; note: string; funded: boolean };
export type ReducedIdea = Idea & { cosigners: Cosign[]; thread: IdeaQuestion[]; approved: Approval | null; seedWait: number };
export type ReducedProblem = Problem;

// The Wait ledger, now past the decision too: late starts and late measures move to the deputy.
export type LedgerCounts = {
  handedOver: number; escalated: number; overrides: number;
  projectsEscalated: number; measuresOwed: number; unmeasured: number;
};
export type State = {
  day: number; cases: ReducedCase[]; ideas: ReducedIdea[]; problems: ReducedProblem[]; projects: ReducedProject[];
  ledger: LedgerCounts; rules: LoopRules;
};

export type ReduceSeed = {
  cases: SeedCase[]; ideas: Idea[]; problems: Problem[]; routes: Route[]; promiseDays: number;
  projects?: SeedProject[]; loop?: Partial<LoopRules>;
};

type CaseRow = { kind?: CaseKind; title: string; body?: string; from: string; fromDept?: string; routeId?: string | null; assignee: string; raisedDay?: number; reason?: string; upside?: string; linkedIdea?: string };

export function reduce(seed: ReduceSeed, log: EventLog): State {
  const day = log.day | 0;
  const routes = seed.routes;
  const routeOf = (id: string | null) => routes.find((r) => r.id === id) ?? null;

  const cases: Record<string, ReducedCase> = {};
  const order: string[] = [];
  const ideas: Record<string, ReducedIdea> = {};
  const problems: Record<string, ReducedProblem> = {};
  const rules = loopRules(seed.loop);
  const book = newBook();

  const freshCase = (id: string, row: CaseRow, isSeed: boolean): ReducedCase => {
    const c: ReducedCase = {
      id, seed: isSeed, kind: row.kind ?? "problem", title: row.title, body: row.body ?? "", from: row.from, fromDept: row.fromDept ?? "",
      routeId: row.routeId ?? null, assignee: row.assignee, raisedDay: row.raisedDay ?? 0,
      reason: row.reason ?? "", upside: row.upside ?? "", linkedIdea: row.linkedIdea ?? null,
      status: "open", read: null, decided: null, question: null, handed: [], building: null, shipped: null,
      override: null, discussion: null, versions: [], pausedDays: 0, pausedSince: null, history: [],
      route: null, age: 0, clock: 0, open: true, archived: false, overdue: false, dueDay: 0, escalated: null,
    };
    c.versions.push({ version: 1, day: c.raisedDay, by: c.from, title: c.title, body: c.body, overall: null });
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
  (seed.projects ?? []).forEach((p) => seedProject(book, p));

  // Seed history first (in day order), then live events (in log order).
  const seedEvents: CaseEvent[] = [];
  const pushSeed = (target: string) => (ev: NonNullable<SeedCase["seedEvents"]>[number], k: number) =>
    seedEvents.push({ id: "seed_" + target + "_" + k, ts: 0, target, seed: true, type: ev.type, day: ev.day, actor: ev.actor, payload: ev.payload ?? {} });
  seed.cases.forEach((row) => (row.seedEvents ?? []).forEach(pushSeed(row.id)));
  seed.ideas.forEach((row) => (row.seedEvents ?? []).forEach(pushSeed(row.id)));
  (seed.projects ?? []).forEach((row) => (row.seedEvents ?? []).forEach(pushSeed(row.id)));
  seedEvents.sort((a, b) => a.day - b.day);

  const apply = (ev: CaseEvent) => {
    if (applyProjectEvent(book, ev, rules)) return;
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
        const first = c.decided === null;
        const answer = pl.answer === "no" ? "no" : "yes";
        // Only the first yes opens a project: a decision cannot fork an idea into two projects.
        const project = first && answer === "yes" ? openOrJoin(book, ev, { id: c.id, from: c.from, routeId: c.routeId, title: c.title }) : null;
        c.decided = {
          answer, reason: pl.reason ?? "", note: pl.note ?? "", by: ev.actor, day: d,
          projectId: project ? project.id : c.decided?.projectId ?? null, lead: project ? project.lead : c.decided?.lead ?? null,
        };
        c.status = "decided";
        c.history.push(ev);
        break;
      }
      case "case.discussion": {
        const c = cases[target];
        if (!c || c.status !== "open" || c.discussion) break;
        if (c.read === null) c.read = d;
        c.discussion = {
          startedDay: d, by: ev.actor, invited: uniq(pl.invited ?? []), missing: pl.missing ?? "", rounds: [],
          round: 1, ready: false, lastDay: 0,
        };
        c.status = "discussion";
        c.history.push(ev);
        break;
      }
      case "case.invited": {
        const c = cases[target];
        if (!c || c.status !== "discussion" || !c.discussion) break;
        c.discussion.invited = uniq(c.discussion.invited.concat(pl.invited ?? []));
        c.history.push(ev);
        break;
      }
      case "case.revised": {
        const c = cases[target];
        if (!c || c.decided || !pl.body?.trim()) break;
        const title = pl.title?.trim() || c.title;
        c.versions.push({ version: c.versions.length + 1, day: d, by: ev.actor, title, body: pl.body, overall: typeof pl.overall === "number" ? pl.overall : null });
        c.title = title;
        c.body = pl.body;
        c.history.push(ev);
        break;
      }
      case "case.checkin": {
        const c = cases[target];
        if (!c || c.status !== "discussion" || !c.discussion || c.discussion.ready) break;
        const next = pl.next === "decide" ? "decide" : "round";
        c.discussion.rounds.push({ round: c.discussion.rounds.length + 1, day: d, by: ev.actor, next, open: (pl.open ?? []).slice(0, 12), note: pl.note ?? "" });
        if (next === "decide") c.discussion.ready = true;
        c.history.push(ev);
        break;
      }
      case "case.handed": {
        const c = cases[target];
        if (!c || (c.status !== "open" && c.status !== "discussion") || !pl.to) break;
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
    c.open = c.status === "open" || c.status === "discussion";
    c.archived = c.status === "decided";
    const talk = c.status === "discussion" ? c.discussion : null;
    if (talk) {
      // In a discussion the next check-in is what is due - or, once it said "decide", the decision.
      const last = talk.rounds[talk.rounds.length - 1];
      talk.round = talk.rounds.length + (talk.ready ? 0 : 1);
      talk.lastDay = talk.startedDay + rules.discussEveryDays * rules.discussMaxRounds;
      c.dueDay = (last ? last.day : talk.startedDay) + rules.discussEveryDays;
      c.overdue = day > c.dueDay;
    } else {
      c.overdue = c.open && c.clock > promise;
      c.dueDay = c.raisedDay + promise + paused;
    }
    // The route's owner takes it if the case sat with someone else, otherwise the owner's deputy.
    // The original owner keeps it too - both can act.
    const to = route ? (route.owner.name === c.assignee ? route.deputy : route.owner.name) : null;
    c.escalated = c.overdue && to ? { to, from: c.assignee, day: c.dueDay + 1, live: c.dueDay + 1 >= 0 } : null;
  });

  const projects = finishProjects(book, { day, promise, rules, routeOf });

  const ledger: LedgerCounts = {
    handedOver: order.reduce((a, id) => a + cases[id].handed.length, 0),
    escalated: order.reduce((a, id) => a + (cases[id].escalated?.live ? 1 : 0), 0),
    overrides: order.reduce((a, id) => a + (cases[id].override ? 1 : 0), 0),
    projectsEscalated: projects.reduce((a, p) => a + (p.escalated?.live ? 1 : 0), 0),
    measuresOwed: projects.reduce((a, p) => a + p.checks.filter((k) => k.late).length, 0),
    unmeasured: projects.reduce((a, p) => a + (p.verdict === "not measured" ? 1 : 0), 0),
  };

  return {
    day,
    cases: order.map((id) => cases[id]),
    ideas: seed.ideas.map((i) => ideas[i.id]),
    problems: seed.problems.map((p) => problems[p.id]),
    projects,
    ledger,
    rules,
  };
}

const uniq = (names: readonly string[]): string[] => [...new Set(names.map((n) => n.trim()).filter(Boolean))];
