// deskThread(): the conversation between the raiser and the desk, in order - and nothing else.
import { describe, expect, it } from "vitest";
import { appendEvent, emptyLog, type EventLog, type NewEvent } from "@/features/cases/events";
import { reduce, type ReduceSeed } from "@/features/cases/reducer";
import { deskPeople, deskThread } from "@/features/cases/thread";
import { CASES, IDEAS, PROBLEMS, PROMISE_DAYS, ROUTES } from "@/features/demo/seed";

const SEED: ReduceSeed = { cases: CASES, ideas: IDEAS, problems: PROBLEMS, routes: ROUTES, promiseDays: PROMISE_DAYS };
const RAISER = "Anonymous #4471"; // c3 is theirs, on T. Vogel's desk
const run = (...evs: NewEvent[]): EventLog => evs.reduce((log, e) => appendEvent(log, e), emptyLog());
const threadOf = (log: EventLog) => { const c = reduce(SEED, log).cases.find((x) => x.id === "c3")!; return deskThread(c, log); };

describe("deskThread", () => {
  it("is empty until someone says something", () => {
    expect(threadOf(emptyLog())).toEqual([]);
  });
  it("question, answer, comments from both sides, the decision - in the order they happened", () => {
    const log = run(
      { type: "case.asked", actor: "T. Vogel", target: "c3", payload: { text: "Which six numbers?" } },
      { type: "case.answered", actor: RAISER, target: "c3", payload: { text: "Torque, temperature, ..." } },
      { type: "case.commented", actor: RAISER, target: "c3", payload: { text: "Could we meet?" } },
      { type: "case.commented", actor: "T. Vogel", target: "c3", payload: { text: "Thursday works." } },
      { type: "case.decided", actor: "T. Vogel", target: "c3", payload: { answer: "yes", note: "Pilot on Line 3." } },
    );
    const t = threadOf(log);
    expect(t.map((e) => e.t)).toEqual(["asked", "answered", "said", "said", "decided"]);
    expect(t.map((e) => e.by)).toEqual(["T. Vogel", RAISER, RAISER, "T. Vogel", "T. Vogel"]);
  });
  it("leaves other people's comments and new information out - those are the feed and the case", () => {
    const log = run(
      { type: "case.commented", actor: "J. Klein", target: "c3", payload: { text: "Same on Line 1." } },
      { type: "case.commented", actor: RAISER, target: "c3", payload: { text: "It is ten minutes each time.", rescore: true } },
    );
    expect(threadOf(log)).toEqual([]);
  });
  it("a hand-over is part of it, and the new holder joins the desk side", () => {
    const log = run(
      { type: "case.handed", actor: "T. Vogel", target: "c3", payload: { to: "H. Sander", why: "forms are Quality's" } },
      { type: "case.commented", actor: "H. Sander", target: "c3", payload: { text: "On it." } },
    );
    const t = threadOf(log);
    expect(t.map((e) => e.t)).toEqual(["handed", "said"]);
    expect(deskPeople(reduce(SEED, log).cases.find((x) => x.id === "c3")!)).toEqual(["H. Sander", "T. Vogel"]);
  });
});
