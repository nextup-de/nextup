// Musterwerk's working day (features/demo/life): sixty working days played through the reducer. New ideas keep coming,
// the colleagues' desks decide them around the promise, yes ideas become projects that are worked and measured, and the
// desk of a real person is left to them.
import { describe, expect, it } from "vitest";
import type { CaseEvent, EventLog } from "@/features/cases/events";
import { NO_CATEGORIES } from "@/features/cases/no";
import { reduce, type ReduceSeed, type State } from "@/features/cases/reducer";
import { DEFAULT_CALENDAR, type ClockSpec } from "@/features/clock";
import { LOCAL_SEED } from "@/features/demo";
import { LIFE_IDEAS } from "@/features/demo/life/catalog";
import { lifeDay, type LifeEvent, type LifePerson, type LifeRoute } from "@/features/demo/life/plan";

const PROMISE = 5;
const KEYS = ["maintenance", "quality", "safety", "process"];
const owners: LifePerson[] = KEYS.map((k, i) => ({ id: `u_o${i}`, name: `Owner ${k}`, dept: k, role: "leader" }));
const members: LifePerson[] = Array.from({ length: 12 }, (_, i) => ({ id: `u_m${i}`, name: `Member ${i}`, dept: KEYS[i % KEYS.length], role: "member" }));
const people = [...owners, ...members];
const routes: LifeRoute[] = KEYS.map((key, i) => ({ key, holderId: `seat_${i}`, owner: owners[i] }));
const template = LOCAL_SEED.routes[0];
const SEED: ReduceSeed = {
  cases: [], ideas: [], problems: [], promiseDays: PROMISE,
  routes: KEYS.map((key, i) => ({ ...template, id: key, owner: { name: owners[i].name, role: "Leiter", dept: key }, ownerSeatId: `seat_${i}`, ownerRoleId: `role_${i}`, deputySeatId: null, deputyRoleId: null })),
  seats: KEYS.map((_, i) => ({ id: `seat_${i}`, roleId: `role_${i}`, label: owners[i].name, userId: owners[i].id, sort: i })),
  clock: { mode: "workdays", calendar: DEFAULT_CALENDAR } as ClockSpec,
};
const isoOf = (day: number) => new Date(Date.UTC(2026, 0, 1) + day * 86_400_000).toISOString().slice(0, 10);

/** Play `days` working days; `humans` own their desks. Returns the final state and every event written. */
function play(days: number, humans: ReadonlySet<string> = new Set(), focus: ReadonlySet<string> = new Set()) {
  const log: CaseEvent[] = [];
  const written: LifeEvent[] = [];
  let state: State = reduce(SEED, { events: [], day: 1 } as EventLog);
  for (let day = 1; day <= days; day++) {
    state = reduce(SEED, { events: log, day } as EventLog);
    const out = lifeDay({ slug: "mw", iso: isoOf(day), today: day, state, promiseDays: PROMISE, routes, people, humans, focus });
    for (const e of out) {
      written.push(e);
      log.push({ id: e.id, ts: 0, day, type: e.type, actor: e.actor, actorUserId: e.actorUserId, target: e.targetId, payload: e.payload } as CaseEvent);
    }
  }
  return { state: reduce(SEED, { events: log, day: days } as EventLog), written };
}

describe("Musterwerk's working day", () => {
  it("raises two to four catalogue ideas a day, on the routes, as ideas", () => {
    const out = lifeDay({ slug: "mw", iso: isoOf(1), today: 1, state: reduce(SEED, { events: [], day: 1 } as EventLog), promiseDays: PROMISE, routes, people, humans: new Set() });
    const raised = out.filter((e) => e.type === "case.raised");
    expect(raised.length).toBeGreaterThanOrEqual(2);
    expect(raised.length).toBeLessThanOrEqual(4);
    for (const e of raised) {
      expect(e.payload.kind).toBe("idea");
      expect(LIFE_IDEAS[e.payload.routeId as string].map((i) => i.title)).toContain(e.payload.title);
      expect(members.map((m) => m.id)).toContain(e.actorUserId);
    }
  });

  it("is the same day twice: same events, same keys", () => {
    const input = { slug: "mw", iso: isoOf(3), today: 3, state: reduce(SEED, { events: [], day: 3 } as EventLog), promiseDays: PROMISE, routes, people, humans: new Set<string>() };
    expect(lifeDay(input)).toEqual(lifeDay(input));
    expect(new Set(lifeDay(input).map((e) => e.idemKey)).size).toBe(lifeDay(input).length);
  });

  it("keeps fresh ideas waiting, clears old ones, and carries projects through to a measure", () => {
    const { state, written } = play(60);
    const open = state.cases.filter((c) => c.open);
    expect(open.length).toBeGreaterThan(3);
    expect(open.every((c) => 60 - c.raisedDay <= PROMISE + 3)).toBe(true);
    expect(open.some((c) => 60 - c.raisedDay < PROMISE)).toBe(true);
    for (const e of written.filter((x) => x.type === "case.decided" && x.payload.answer === "no")) {
      expect(NO_CATEGORIES).toContain(e.payload.category);
      expect((e.payload.reason as string).length).toBeGreaterThanOrEqual(40);
    }
    expect(state.projects.length).toBeGreaterThan(5);
    expect(state.projects.some((p) => p.status === "running" && p.steps.length === 4)).toBe(true);
    expect(state.projects.some((p) => p.measures.length > 0)).toBe(true);
    expect(state.projects.every((p) => p.baseline !== null)).toBe(true);
  });

  it("leaves a real person's desk to them, with every idea of their route waiting", () => {
    const human = owners[0].id;
    const { state, written } = play(40, new Set([human]));
    expect(written.filter((e) => e.actorUserId === human)).toEqual([]);
    // Every idea of the route is waiting for them, none twice: a new one comes as soon as they decide one.
    const mine = state.cases.filter((c) => c.assigneeSeatId === "seat_0");
    expect(mine.every((c) => c.open && c.decided === null)).toBe(true);
    expect(new Set(mine.map((c) => c.title)).size).toBe(LIFE_IDEAS.maintenance.length);
    expect(mine.length).toBe(LIFE_IDEAS.maintenance.length);
  });

  it("gives the demo accounts something to click every day: a desk idea, a discussion, a step in a planned project", () => {
    // Like Julia Rossi (holds the maintenance desk) and Kevin Schmid (a member without a desk); both acted in the app.
    const julia = owners[0].id;
    const kevin = members[1].id;
    const focus = new Set([julia, kevin]);
    const { state, written } = play(40, focus, focus);
    expect(written.filter((e) => e.actorUserId === julia || e.actorUserId === kevin)).toEqual([]);
    // Julia's desk always has ideas waiting.
    expect(state.cases.filter((c) => c.assigneeSeatId === "seat_0" && c.open).length).toBeGreaterThan(0);
    // Kevin is invited to discuss on (nearly) every day, by the desk owner, on an idea that is not his own.
    const talks = written.filter((e) => e.type === "case.discussion");
    expect(talks.length).toBeGreaterThan(30);
    for (const e of talks) expect(e.payload.invitedUserIds).toContain(kevin);
    expect(state.cases.some((c) => c.open && c.discussion?.invitedUserIds.includes(kevin))).toBe(true);
    // He is in at most two running simulated projects, with a step of his own; every simulated project has two dated milestones.
    const sim = state.projects.filter((p) => p.id.includes("-lp-"));
    const running = sim.filter((p) => !p.closed && !p.stopped && p.memberUserIds.includes(kevin));
    expect(running.length).toBeGreaterThan(0);
    expect(running.length).toBeLessThanOrEqual(2);
    expect(sim.some((p) => p.steps.some((x) => x.ownerUserId === kevin))).toBe(true);
    const planned = sim.filter((p) => p.steps.length === 4);
    expect(planned.length).toBeGreaterThan(0);
    for (const p of planned) {
      expect(p.milestones.map((m) => m.title)).toEqual(["Umgesetzt", "Wirkung gemessen"]);
      expect(p.steps.every((x) => x.dueDay !== null && x.milestoneId)).toBe(true);
    }
    expect(sim.some((p) => p.milestones.some((m) => m.shipped))).toBe(true);
    // His own step waits five working days before the lead finishes it.
    for (const e of written.filter((x) => x.type === "project.step.moved" && x.payload.to === "done")) {
      const p = sim.find((x) => x.id === e.targetId);
      const step = p?.steps.find((x) => x.id === e.payload.stepId);
      if (step?.ownerUserId === kevin) expect(step.doneDay! - step.startedDay!).toBeGreaterThanOrEqual(5);
    }
  });

  it("gives every focus person who holds a desk an idea of their own every day, and none twice on a rerun", () => {
    // Like Julia Rossi (Linie A desk) and Kevin Schmid (Werkleiter desk since 16 Nov 2026), both acting in the app.
    const julia = owners[0].id, kevin = owners[2].id;
    const focus = new Set([julia, kevin]);
    // Each of them has an idea on their desk from the first day on and every day after: their own desks are never decided
    // for them, so the ideas stay until they act (the catalogue of a desk runs out once all its ideas are waiting there).
    for (let d = 1; d <= 20; d++) {
      const { state } = play(d, focus, focus);
      for (const seat of ["seat_0", "seat_2"]) expect(state.cases.some((c) => c.assigneeSeatId === seat && c.open && !c.decided), `${seat} on day ${d}`).toBe(true);
    }
    const { written } = play(20, focus, focus);
    const raisedOn = (seat: string, d: number) => written.filter((e) => e.type === "case.raised" && e.payload.assigneeRoleHolderId === seat && e.idemKey.startsWith(`life:${isoOf(d)}:`));
    for (const seat of ["seat_0", "seat_2"]) expect(raisedOn(seat, 1).length, seat).toBeGreaterThan(0);
    // A second run the same day (the loop runs every 10 minutes), after today's ideas are in, raises no second one for them.
    const day = 1;
    const log: CaseEvent[] = [];
    const first = lifeDay({ slug: "mw", iso: isoOf(day), today: day, state: reduce(SEED, { events: log, day } as EventLog), promiseDays: PROMISE, routes, people, humans: focus, focus });
    const after = [...log, ...first.map((e) => ({ id: e.id, ts: 0, day, type: e.type, actor: e.actor, actorUserId: e.actorUserId, target: e.targetId, payload: e.payload }) as CaseEvent)];
    const again = lifeDay({ slug: "mw", iso: isoOf(day), today: day, state: reduce(SEED, { events: after, day } as EventLog), promiseDays: PROMISE, routes, people, humans: focus, focus });
    const newKeys = new Set(first.map((e) => e.idemKey));
    expect(first.some((e) => e.idemKey.includes(":raise:focus:"))).toBe(true);
    expect(again.filter((e) => e.idemKey.includes(":raise:focus:") && !newKeys.has(e.idemKey)).map((e) => e.idemKey)).toEqual([]);
  });

  it("decides an old generated case the clock passed to a seat that owns no route, as that seat's holder", () => {
    const up = { id: "seat_up", roleId: "role_up", label: members[0].name, userId: members[0].id, sort: 9 };
    const seed: ReduceSeed = { ...SEED, seats: [...SEED.seats!, up] };
    const raised = { id: "e1", ts: 0, day: 1, type: "case.raised", actor: members[1].name, actorUserId: members[1].id, target: "mw-c1",
      payload: { title: "Alter Fall", body: "x", routeId: "maintenance", assignee: members[0].name, assigneeRoleHolderId: "seat_up", kind: "idea" } } as CaseEvent;
    const state = reduce(seed, { events: [raised], day: 30 } as EventLog);
    expect(state.cases.find((c) => c.id === "mw-c1")?.assigneeSeatId).toBe("seat_up");
    const out = lifeDay({ slug: "mw", iso: isoOf(30), today: 30, state, promiseDays: PROMISE, routes, people, humans: new Set() });
    const decided = out.find((e) => e.type === "case.decided" && e.targetId === "mw-c1");
    expect(decided?.actorUserId).toBe(members[0].id);
  });
});

