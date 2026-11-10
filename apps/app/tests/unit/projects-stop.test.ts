// Decision Q6.21: the lead or a manager stops a project with a reason; the lead, the team and who raised the idea
// are told, with the reason. The sponsor of the decision does not exist yet.
import { describe, expect, it } from "vitest";
import type { CaseEvent, CaseEventType, EventLog, EventPayload } from "@/features/cases/events";
import { mayAppend } from "@/features/cases/permissions";
import { reduce, type ReduceSeed } from "@/features/cases/reducer";
import { CASES, IDEAS, PROBLEMS, PROMISE_DAYS, ROUTES } from "@/features/demo/seed";
import { loopMails, type Person } from "@/features/loop/notice";
import { followsTemplate, NOTIFY_GROUPS } from "@/features/notify/digest";

const UID: Record<string, string> = { "T. Vogel": "u_tv", "H. Sander": "u_hs", "L. Brandt": "u_lb", "B. Hartmann": "u_bh", "Anonymous #4471": "u_js" };
const people: Person[] = [
  { id: "u_js", name: "J. Schmidt", email: "js@acme.test" },
  { id: "u_tv", name: "T. Vogel", email: "tv@acme.test" },
  { id: "u_hs", name: "H. Sander", email: "hs@acme.test" },
  { id: "u_lb", name: "L. Brandt", email: "lb@acme.test" },
  { id: "u_bh", name: "B. Hartmann", email: "bh@acme.test", manager: true },
];
let n = 0;
const ev = (type: CaseEventType, actor: string, target: string, payload: EventPayload = {}, day = 0): CaseEvent =>
  ({ id: "s" + n++, ts: 0, type, actor, actorUserId: UID[actor] ?? null, target, payload, day });
const P = (type: CaseEventType, payload: EventPayload = {}, day = 0, actor = "L. Brandt") => ev(type, actor, "p_m", payload, day);
const before = [
  ev("case.raised", "Anonymous #4471", "c_m", { kind: "idea", title: "Shorter changeover", body: "x", routeId: "r1", assignee: "T. Vogel" }),
  ev("case.decided", "T. Vogel", "c_m", { answer: "yes", projectId: "p_m", lead: "L. Brandt", leadUserId: "u_lb", title: "Changeover cart" }),
  P("project.member", { userId: "u_hs", name: "H. Sander" }),
];
const SEED: ReduceSeed = { cases: CASES, ideas: IDEAS, problems: PROBLEMS, routes: ROUTES, promiseDays: PROMISE_DAYS };
const stateOf = (...more: CaseEvent[]) => {
  const log: EventLog = { events: [...before, ...more], day: 5 };
  const state = reduce(SEED, log);
  // The raiser's id reaches a project's authorUserIds through the case reducer (IDN-A1); here it is set by hand.
  for (const p of state.projects) if (!p.authorUserIds.length) p.authorUserIds = ["u_js"];
  return state;
};
const mails = (last: CaseEvent, ...more: CaseEvent[]) => loopMails({ ev: last, state: stateOf(...more, last), people, baseUrl: "https://acme.sellux.ch" });
const SUBJECT = "P-1 stopped: Changeover cart";

describe("stopping a project", () => {
  it("the lead and a manager may, with a reason; a team member, the raiser and the desk may not", () => {
    const S = stateOf();
    const stop = (who: string, role: "member" | "leader" | "manager", why = "No budget this year") =>
      mayAppend({ role, name: who, handle: null, userId: UID[who] }, { type: "project.stopped", target: "p_m", payload: { why } }, S).ok;
    expect(stop("L. Brandt", "leader")).toBe(true);
    expect(stop("B. Hartmann", "manager")).toBe(true);
    expect(stop("H. Sander", "member")).toBe(false);
    expect(stop("Anonymous #4471", "member")).toBe(false);
    expect(stop("T. Vogel", "leader")).toBe(false);
    expect(stop("L. Brandt", "leader", "  ")).toBe(false);
  });

  it("a manager's stop tells the lead, the team and the raiser, with the reason", () => {
    const stopped = P("project.stopped", { why: "The line closes in March." }, 4, "B. Hartmann");
    const out = mails(stopped);
    expect(out.map((m) => [m.to, m.subject])).toEqual([["lb@acme.test", SUBJECT], ["hs@acme.test", SUBJECT], ["js@acme.test", SUBJECT]]);
    expect(out[0].text).toContain("B. Hartmann stopped this project. The reason given:");
    expect(out[0].text).toContain("  The line closes in March.");
    expect(out[0].text).toContain("The idea it came from stays in the archive.");
    expect(out[0].text).toContain("https://acme.sellux.ch/projects/p_m");
  });

  it("the lead who stops it gets nothing; a second stop, or one after the reward, tells nobody", () => {
    const first = P("project.stopped", { why: "No budget" }, 4);
    expect(mails(first).map((m) => m.to)).toEqual(["hs@acme.test", "js@acme.test"]);
    expect(mails(P("project.stopped", { why: "Again" }, 5, "B. Hartmann"), first)).toEqual([]);
    const done = [
      P("project.baseline", { metric: "m", unit: "min", value: 42, better: "down" }), P("project.started"), P("project.done", {}, 1),
      P("project.measured", { check: 30, value: 30 }, 2), P("project.rewarded", { rule: "thanks" }, 3, "B. Hartmann"),
    ];
    expect(mails(P("project.stopped", { why: "Late" }, 4, "B. Hartmann"), ...done)).toEqual([]);
  });

  it("the stop notice is a loop notice a person can switch, and follows an earlier choice for 'done'", () => {
    expect(NOTIFY_GROUPS.loop).toContain("loop.project.stopped");
    expect(followsTemplate("loop.project.stopped")).toBe("loop.project.done");
  });
});
