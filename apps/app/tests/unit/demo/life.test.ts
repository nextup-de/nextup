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
function play(days: number, humans: ReadonlySet<string> = new Set()) {
  const log: CaseEvent[] = [];
  const written: LifeEvent[] = [];
  let state: State = reduce(SEED, { events: [], day: 1 } as EventLog);
  for (let day = 1; day <= days; day++) {
    state = reduce(SEED, { events: log, day } as EventLog);
    const out = lifeDay({ slug: "mw", iso: isoOf(day), today: day, state, promiseDays: PROMISE, routes, people, humans });
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
});
