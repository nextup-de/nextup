// What the app sends the brain after a decision (features/projects/brain.ts): the round's comments with
// roles instead of names, clipped to the brain's limits.
import { describe, expect, it } from "vitest";
import type { CaseEvent, CaseEventType, EventLog, EventPayload } from "@/features/cases/events";
import { reduce, type ReduceSeed } from "@/features/cases/reducer";
import { CASES, IDEAS, PROBLEMS, PROMISE_DAYS, ROUTES } from "@/features/demo/seed";
import { checkinRequest, planRequest, roundSaid } from "@/features/projects/brain";

const SEED: ReduceSeed = { cases: CASES, ideas: IDEAS, problems: PROBLEMS, routes: ROUTES, promiseDays: PROMISE_DAYS };
let n = 0;
const ev = (type: CaseEventType, actor: string, payload: EventPayload = {}, day = 0): CaseEvent => ({ id: "b" + n++, ts: 0, type, actor, target: "c_b", payload, day });
const AUTHOR = "Anonymous #4471";

const log: EventLog = {
  day: 4,
  events: [
    ev("case.raised", AUTHOR, { kind: "idea", title: "Setup cart", body: "x".repeat(6000), routeId: "r1", assignee: "T. Vogel" }),
    ev("case.commented", "H. Sander", { text: "Before the discussion" }),
    ev("case.discussion", "T. Vogel", { invited: ["H. Sander"], missing: "A measured number" }, 1),
    ev("case.commented", "H. Sander", { text: "MES says 38 minutes." }, 2),
    ev("case.commented", "system:mail", { text: "Route owner notified by email." }, 2),
    ev("case.commented", AUTHOR, { text: "Thanks, added to v2." }, 2),
    ev("case.checkin", "T. Vogel", { next: "round", open: ["Who stocks it"] }, 3),
    ev("case.commented", "L. Brandt", { text: "Maintenance can stock it." }, 4),
  ],
};
const c = reduce(SEED, log).cases.find((x) => x.id === "c_b")!;
const roleOf = (name: string) => (name === "H. Sander" ? "Quality lead" : null);

describe("brain requests after a decision", () => {
  it("the round under way: comments since the last check-in, roles not names, no system notes", () => {
    expect(roundSaid(c, log, roleOf)).toEqual([{ who: "a colleague", text: "Maintenance can stock it." }]);
    const firstRound = { ...c, discussion: { ...c.discussion!, rounds: [] } };
    expect(roundSaid(firstRound, log, roleOf)).toEqual([
      { who: "Quality lead", text: "MES says 38 minutes." },
      { who: "the author", text: "Thanks, added to v2." },
      { who: "a colleague", text: "Maintenance can stock it." },
    ]);
  });

  it("a check-in request carries the round, what was missing and the weak dials, clipped", () => {
    const req = checkinRequest("Acme Components", c, roundSaid(c, log, roleOf), ["Cost", "Risk"]);
    expect(req.round).toBe(2);
    expect(req.missing).toBe("A measured number");
    expect(req.weak).toEqual(["Cost", "Risk"]);
    expect(req.idea.body.length).toBe(5000);
  });

  it("a plan request names the company's goals", () => {
    const req = planRequest("Acme", { title: " Setup cart ", body: "body" }, [{ goal: "Every changeover under 20 minutes" }]);
    expect(req).toEqual({ company: "Acme", idea: { title: "Setup cart", body: "body" }, goals: [{ name: "Every changeover under 20 minutes", kpi: "" }] });
  });
});
