// dashboardRow(): facts for the employee's dashboard - open since, every desk, stage, score.
import { describe, expect, it } from "vitest";
import { appendEvent, emptyLog } from "@/features/cases/events";
import { reduce, type ReduceSeed } from "@/features/cases/reducer";
import { dashboardRow, overviewSteps } from "@/features/cases/rows";
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

describe("Overview step and status", () => {
  const ask = (log = emptyLog()) => appendEvent(log, { type: "case.asked", actor: "T. Vogel", target: "c3", payload: { text: "Which six numbers?" } });
  const other = { name: "T. Vogel", handle: null };
  it("a fresh case sits on the lead's desk, waiting", () => {
    const r = rowFor("c3");
    expect(r.step).toBe(2);
    expect(r.status).toBe("waiting");
  });
  it("a question is the raiser's move, and only theirs", () => {
    expect(rowFor("c3", ask()).status).toBe("move");
    expect(rowFor("c3", ask()).paused).toBe(true);
    const c = reduce(SEED, ask()).cases.find((x) => x.id === "c3")!;
    expect(dashboardRow(c, PROMISE_DAYS, other).status).toBe("asked");
  });
  it("answered: replied, still with the lead", () => {
    const log = appendEvent(ask(), { type: "case.answered", actor: "Anonymous #4471", target: "c3", payload: { text: "Torque, temperature, ..." } });
    const r = rowFor("c3", log);
    expect(r.status).toBe("replied");
    expect(r.step).toBe(2);
  });
  it("decided, building, shipped move the step on", () => {
    const no = appendEvent(emptyLog(), { type: "case.decided", actor: "T. Vogel", target: "c4", payload: { answer: "no", reason: "not now" } });
    expect(rowFor("c4", no).step).toBe(3);
    expect(rowFor("c4", no).status).toBe("declined");
    expect(rowFor("c8").step).toBe(4);
    expect(rowFor("c8").status).toBe("building");
    expect(rowFor("c7").step).toBe(5);
    expect(rowFor("c7").status).toBe("shipped");
  });
  it("the tracker: raised and AI check done, the lead's step now, the rest to do", () => {
    const c = reduce(SEED, ask()).cases.find((x) => x.id === "c3")!;
    const steps = overviewSteps(c, (d) => "day " + d, true);
    expect(steps.map((s) => s.tone)).toEqual(["done", "done", "now", "todo", "todo"]);
    expect(steps[2].sub).toBe("Question for you");
    expect(overviewSteps(c, (d) => "day " + d, false)[2].sub).toBe("Question out");
  });
});
