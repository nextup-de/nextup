// Who gets which mail after the routing (features/loop/notice.ts).
import { describe, expect, it } from "vitest";
import type { CaseEvent, CaseEventType, EventLog, EventPayload } from "@/features/cases/events";
import { reduce, type ReduceSeed } from "@/features/cases/reducer";
import { CASES, IDEAS, PROBLEMS, PROMISE_DAYS, ROUTES } from "@/features/demo/seed";
import { loopMails, type Person } from "@/features/loop/notice";

const SEED: ReduceSeed = { cases: CASES, ideas: IDEAS, problems: PROBLEMS, routes: ROUTES, promiseDays: PROMISE_DAYS };
let n = 0;
const ev = (type: CaseEventType, actor: string, target: string | null, payload: EventPayload = {}, day = 0): CaseEvent =>
  ({ id: "n" + n++, ts: 0, type, actor, target, payload, day });
const AUTHOR = "Anonymous #4471";
const people: Person[] = [
  { name: "J. Schmidt", email: "js@acme.test", handle: AUTHOR },
  { name: "T. Vogel", email: "tv@acme.test" },
  { name: "H. Sander", email: "hs@acme.test" },
  { name: "L. Brandt", email: "lb@acme.test" },
  { name: "M. Roth", email: "" },
];
const raised = ev("case.raised", AUTHOR, "c_m", { kind: "idea", title: "Shorter changeover", body: "x", routeId: "r1", assignee: "T. Vogel" });
const mails = (last: CaseEvent, ...before: CaseEvent[]) => {
  const log: EventLog = { events: [raised, ...before, last], day: last.day };
  return loopMails({ ev: last, state: reduce(SEED, log), people, baseUrl: "https://acme.sellux.ch" });
};

describe("loopMails", () => {
  it("a discussion asks each invited person (with an address) and tells the author, never the actor", () => {
    const out = mails(ev("case.discussion", "T. Vogel", "c_m", { invited: ["H. Sander", "M. Roth", "T. Vogel"], missing: "The saving" }));
    expect(out.map((m) => m.to)).toEqual(["hs@acme.test", "js@acme.test"]);
    expect(out[0].subject).toBe("Your view is asked: Shorter changeover");
    expect(out[0].text).toContain("Still missing: The saving");
    expect(out[0].text).toContain("in 3 days");
    expect(out[0].text).toContain("https://acme.sellux.ch/cases/c_m");
  });

  it("a check-in reaches the author and everyone invited", () => {
    const talk = ev("case.discussion", "T. Vogel", "c_m", { invited: ["H. Sander"] });
    const out = mails(ev("case.checkin", "T. Vogel", "c_m", { next: "decide", open: ["Cost"], note: "Quote is in" }, 3), talk);
    expect(out.map((m) => m.to)).toEqual(["js@acme.test", "hs@acme.test"]);
    expect(out[0].text).toContain("ready to decide");
    expect(out[0].text).toContain("Still open: Cost");
  });

  it("a yes that opens a project tells the author and the new lead", () => {
    const out = mails(ev("case.decided", "T. Vogel", "c_m", { answer: "yes", projectId: "p_m", lead: "L. Brandt", title: "Changeover cart" }));
    expect(out.map((m) => [m.to, m.subject])).toEqual([
      ["js@acme.test", "Your idea was accepted: Shorter changeover"],
      ["lb@acme.test", "You lead P-1: Changeover cart"],
    ]);
    expect(out[0].text).toContain("https://acme.sellux.ch/projects/p_m");
  });

  it("the author hears the measure with its numbers, also when worse", () => {
    const P = (type: CaseEventType, payload: EventPayload = {}, day = 0) => ev(type, "L. Brandt", "p_m", payload, day);
    const before = [
      ev("case.decided", "T. Vogel", "c_m", { answer: "yes", projectId: "p_m", lead: "L. Brandt" }),
      P("project.baseline", { metric: "Changeover", unit: "min", value: 42, better: "down" }), P("project.started"), P("project.done", {}, 1),
    ];
    const out = mails(P("project.measured", { check: 30, value: 45 }, 31), ...before);
    expect(out).toHaveLength(1);
    expect(out[0].to).toBe("js@acme.test");
    expect(out[0].text).toContain("measured after 30 days: worse. Changeover: 42 → 45 min");
  });

  it("other events send nothing", () => {
    expect(mails(ev("case.read", "T. Vogel", "c_m"))).toEqual([]);
  });
});
