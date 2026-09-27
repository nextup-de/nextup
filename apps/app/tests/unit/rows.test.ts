// dashboardRow(): facts for the employee's dashboard - open since, every desk, stage, score.
import { describe, expect, it } from "vitest";
import { appendEvent, emptyLog } from "@/features/cases/events";
import { reduce, type ReduceSeed } from "@/features/cases/reducer";
import { dashboardRow } from "@/features/cases/rows";
import { CASES, IDEAS, PROBLEMS, PROMISE_DAYS, ROUTES } from "@/features/demo/seed";

const SEED: ReduceSeed = { cases: CASES, ideas: IDEAS, problems: PROBLEMS, routes: ROUTES, promiseDays: PROMISE_DAYS };
const viewer = { name: "J. Schmidt", handle: "Anonymous #4471" };
const rowFor = (id: string, log = emptyLog()) => dashboardRow(reduce(SEED, log).cases.find((c) => c.id === id)!, PROMISE_DAYS, viewer);

describe("dashboardRow", () => {
  it("c1: 7 d open, past the promise, escalated from T. Vogel - the chain shows both desks", () => {
    const r = rowFor("c1");
    expect(r.openDays).toBe(7);
    expect(r.overdue).toBe(true);
    expect(r.stage).toBe("Sent");
    expect(r.chain[0]).toBe("T. Vogel");
    expect(r.escalated).toBe(true);
    expect(r.chain.length).toBe(2);
    expect(r.score.parts.some((p) => p.label === "Past the promise")).toBe(true);
  });
  it("a hand-over adds a hop; the last name is where it is now", () => {
    const log = appendEvent(emptyLog(), { type: "case.handed", actor: "T. Vogel", target: "c4", payload: { to: "H. Sander", why: "gauges are Quality's" } });
    const r = rowFor("c4", log);
    expect(r.chain).toEqual(["T. Vogel", "H. Sander"]);
    expect(r.stage).toBe("Read");
  });
  it("mine: matches the viewer by handle; shipped rows are closed and scored without the wait", () => {
    const r = rowFor("c7");
    expect(r.mine).toBe(true);
    expect(r.kind).toBe("idea");
    expect(r.open).toBe(false);
    expect(r.stage).toBe("Shipped");
    expect(r.score.parts.some((p) => p.label.startsWith("Waiting"))).toBe(false);
  });
});
