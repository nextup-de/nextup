// Decision Q6.20: "closed" stays derived, and the event that closes a project sends one summary to the lead, the
// team and who raised the idea.
import { describe, expect, it } from "vitest";
import type { CaseEvent, CaseEventType, EventLog, EventPayload } from "@/features/cases/events";
import { reduce, type ReduceSeed } from "@/features/cases/reducer";
import { CASES, IDEAS, PROBLEMS, PROMISE_DAYS, ROUTES } from "@/features/demo/seed";
import { loopMails, type Person } from "@/features/loop/notice";
import type { LoopRules } from "@/features/loop/rules";
import { followsTemplate, NOTIFY_GROUPS } from "@/features/notify/digest";
import { closingEvent } from "@/features/projects/close";

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
  ({ id: "z" + n++, ts: 0, type, actor, actorUserId: UID[actor] ?? null, target, payload, day });
const P = (type: CaseEventType, payload: EventPayload = {}, day = 0, actor = "L. Brandt") => ev(type, actor, "p_m", payload, day);

/** Raised, accepted with L. Brandt as lead and H. Sander on the team, baselined (lower is better), started, done on day 1. */
const done = P("project.done", {}, 1);
const before = [
  ev("case.raised", "Anonymous #4471", "c_m", { kind: "idea", title: "Shorter changeover", body: "x", routeId: "r1", assignee: "T. Vogel" }),
  ev("case.decided", "T. Vogel", "c_m", { answer: "yes", projectId: "p_m", lead: "L. Brandt", leadUserId: "u_lb", title: "Changeover cart" }),
  P("project.member", { userId: "u_hs", name: "H. Sander" }),
  P("project.baseline", { metric: "Changeover", unit: "min", value: 42, better: "down" }), P("project.started"), done,
];
const better = P("project.measured", { check: 30, value: 30 }, 31);
const worse = P("project.measured", { check: 30, value: 45 }, 31);
const confirm = (day = 32) => P("project.measure.confirmed", { check: 30 }, day, "B. Hartmann");

const NONE = { kind: "none" as const, amount: null, sharePct: null, capEur: null };
function world(loop: Partial<LoopRules>, ...more: CaseEvent[]) {
  const seed: ReduceSeed = { cases: CASES, ideas: IDEAS, problems: PROBLEMS, routes: ROUTES, promiseDays: PROMISE_DAYS, loop: { measureDays: [30], ...loop } };
  const log: EventLog = { events: [...before, ...more], day: more[more.length - 1]?.day ?? 1 };
  const state = reduce(seed, log);
  // The raiser's id reaches a project's authorUserIds through the case reducer (IDN-A1); here it is set by hand.
  for (const p of state.projects) if (!p.authorUserIds.length) p.authorUserIds = ["u_js"];
  const project = state.projects.find((p) => p.id === "p_m")!;
  return {
    project, closing: closingEvent(project, state.rules),
    mails: (last: CaseEvent) => loopMails({ ev: last, state, people, baseUrl: "https://acme.sellux.ch" }).map((m) => [m.to, m.subject]),
    /** The text of the mail to one address, or of the first mail. */
    text: (last: CaseEvent, to?: string) => {
      const out = loopMails({ ev: last, state, people, baseUrl: "https://acme.sellux.ch" });
      return (to ? out.find((m) => m.to === to) : out[0])?.text ?? "";
    },
  };
}
const SUMMARY = "P-1 closed: Changeover cart";

describe("the event that closes a project", () => {
  it("with a reward possible: not the result, not a better confirmed result, but the reward", () => {
    const c1 = confirm();
    expect(world({}, better).project.closed).toBe(false);
    expect(world({}, better, c1).closing).toBeNull(); // the reward is due, the project is still open
    const reward = P("project.rewarded", { rule: "thanks", note: "Well done" }, 33, "B. Hartmann");
    const w = world({}, better, c1, reward);
    expect(w.project.closed).toBe(true);
    expect(w.closing?.id).toBe(reward.id);
  });

  it("a result that is not better closes it with its confirmation, never with a later one", () => {
    const c1 = confirm(), c2 = confirm(34);
    expect(world({}, worse).closing).toBeNull();
    expect(world({}, worse, c1).closing?.id).toBe(c1.id);
    expect(world({}, worse, c1, c2).closing?.id).toBe(c1.id);
    // A confirmation sent before there was a result confirmed nothing.
    const early = confirm(20);
    expect(world({}, early, worse, c1).closing?.id).toBe(c1.id);
  });

  it("where no reward can follow, the last result closes it; without the measure step, 'done' does", () => {
    const c1 = confirm();
    expect(world({ reward: NONE }, better).closing?.id).toBe(better.id);
    expect(world({ reward: NONE }, better, c1).closing?.id).toBe(better.id);
    expect(world({ recognition: false }, worse).closing?.id).toBe(worse.id);
    expect(world({ measure: false }).closing?.id).toBe(done.id);
  });

  it("a stopped project has no closing event here: the stop tells its own story", () => {
    const w = world({}, P("project.stopped", { why: "No budget" }, 5));
    expect(w.project.closed).toBe(true);
    expect(w.closing).toBeNull();
  });
});

describe("the close summary", () => {
  it("the reward that closes it tells the lead, the team and the raiser once, with the result and the recognition", () => {
    const reward = P("project.rewarded", { rule: "thanks", note: "Well done" }, 33, "B. Hartmann");
    const w = world({}, better, confirm(), reward);
    expect(w.mails(reward)).toEqual([["lb@acme.test", SUMMARY], ["hs@acme.test", SUMMARY], ["js@acme.test", SUMMARY]]);
    const text = w.text(reward);
    expect(text).toContain("This project is closed. This is how it ended:");
    expect(text).toContain("  Result after 30 days: better. Changeover: 42 → 30 min");
    expect(text).toContain("  Recognition: thank you - Well done.");
    expect(text).toContain("https://acme.sellux.ch/projects/p_m");
  });

  it("the confirmation of a worse result closes it and tells them; whoever confirmed gets nothing, a second confirmation nobody", () => {
    const c1 = confirm(), c2 = confirm(34);
    const w = world({}, worse, c1, c2);
    expect(w.mails(c1)).toEqual([["lb@acme.test", SUMMARY], ["hs@acme.test", SUMMARY], ["js@acme.test", SUMMARY]]);
    expect(w.text(c1)).toContain("Result after 30 days: worse. Changeover: 42 → 45 min");
    expect(w.mails(c2)).toEqual([]);
    // A confirmation that closes nothing (the reward is due) sends nothing either.
    const open = confirm();
    expect(world({}, better, open).mails(open)).toEqual([]);
  });

  it("a last result that closes it says when nobody confirmed it; the author gets the summary, not the step mail too", () => {
    const w = world({ reward: NONE }, better);
    const out = w.mails(better);
    // The lead typed it and gets nothing; the manager is asked to confirm; team and raiser get the summary.
    expect(out).toEqual([["bh@acme.test", "P-1 result to confirm: Changeover cart"], ["hs@acme.test", SUMMARY], ["js@acme.test", SUMMARY]]);
    expect(w.text(better, "js@acme.test")).toContain("Result after 30 days: better, not confirmed by a second person. Changeover: 42 → 30 min");
  });

  it("a project that is done without a measure step says so", () => {
    const w = world({ measure: false });
    expect(w.mails(done)).toEqual([["hs@acme.test", SUMMARY], ["js@acme.test", SUMMARY]]);
    expect(w.text(done)).toContain("It was not measured.");
  });

  it("a result that closes nothing still only tells the author the step, as before", () => {
    expect(world({}, worse).mails(worse)).toEqual([["bh@acme.test", "P-1 result to confirm: Changeover cart"], ["js@acme.test", "P-1 measured: Changeover cart"]]);
  });

  it("the confirmation is a loop notice a person can switch, and follows an earlier choice for the measure notice", () => {
    expect(NOTIFY_GROUPS.loop).toContain("loop.project.measure.confirmed");
    expect(followsTemplate("loop.project.measure.confirmed")).toBe("loop.project.measured");
  });
});
