// Who gets which mail after the routing (features/loop/notice.ts).
import { describe, expect, it } from "vitest";
import type { CaseEvent, CaseEventType, EventLog, EventPayload } from "@/features/cases/events";
import { reduce, type ReduceSeed } from "@/features/cases/reducer";
import { CASES, IDEAS, PROBLEMS, PROMISE_DAYS, ROUTES } from "@/features/demo/seed";
import { loopMails, type Person } from "@/features/loop/notice";

const SEED: ReduceSeed = { cases: CASES, ideas: IDEAS, problems: PROBLEMS, routes: ROUTES, promiseDays: PROMISE_DAYS };
// Mail goes to user ids (IDN/D2); names and handles only greet.
const UID: Record<string, string> = { "T. Vogel": "u_tv", "H. Sander": "u_hs", "L. Brandt": "u_lb", "M. Roth": "u_mr", "J. Schmidt": "u_js", "Anonymous #4471": "u_js" };
let n = 0;
const ev = (type: CaseEventType, actor: string, target: string | null, payload: EventPayload = {}, day = 0): CaseEvent =>
  ({ id: "n" + n++, ts: 0, type, actor, actorUserId: UID[actor] ?? null, target, payload, day });
const AUTHOR = "Anonymous #4471";
const people: Person[] = [
  { id: "u_js", name: "J. Schmidt", email: "js@acme.test", handle: AUTHOR },
  { id: "u_tv", name: "T. Vogel", email: "tv@acme.test" },
  { id: "u_hs", name: "H. Sander", email: "hs@acme.test" },
  { id: "u_lb", name: "L. Brandt", email: "lb@acme.test" },
  { id: "u_mr", name: "M. Roth", email: "" },
];
const raised = ev("case.raised", AUTHOR, "c_m", { kind: "idea", title: "Shorter changeover", body: "x", routeId: "r1", assignee: "T. Vogel" });
const mails = (last: CaseEvent, ...before: CaseEvent[]) => {
  const log: EventLog = { events: [raised, ...before, last], day: last.day };
  const state = reduce(SEED, log);
  // The raiser's id reaches a project's authorUserIds through the case reducer (IDN-A1); here it is set by hand.
  for (const p of state.projects) if (!p.authorUserIds.length) p.authorUserIds = ["u_js"];
  return loopMails({ ev: last, state, people, baseUrl: "https://acme.sellux.ch" });
};

describe("loopMails", () => {
  it("a discussion asks each invited person (with an address) and tells the author, never the actor", () => {
    const out = mails(ev("case.discussion", "T. Vogel", "c_m", { invited: ["H. Sander", "M. Roth", "T. Vogel"], invitedUserIds: ["u_hs", "u_mr", "u_tv"], missing: "The saving" }));
    expect(out.map((m) => m.to)).toEqual(["hs@acme.test", "js@acme.test"]);
    expect(out[0].subject).toBe("Your view is asked: Shorter changeover");
    expect(out[0].text).toContain("Still missing: The saving");
    expect(out[0].text).toContain("in 3 days");
    expect(out[0].text).toContain("https://acme.sellux.ch/cases/c_m");
  });

  it("a check-in reaches the author and everyone invited", () => {
    const talk = ev("case.discussion", "T. Vogel", "c_m", { invited: ["H. Sander"], invitedUserIds: ["u_hs"] });
    const out = mails(ev("case.checkin", "T. Vogel", "c_m", { next: "decide", open: ["Cost"], note: "Quote is in" }, 3), talk);
    expect(out.map((m) => m.to)).toEqual(["js@acme.test", "hs@acme.test"]);
    expect(out[0].text).toContain("ready to decide");
    expect(out[0].text).toContain("Still open: Cost");
  });

  it("a yes that opens a project tells the author and the new lead", () => {
    const out = mails(ev("case.decided", "T. Vogel", "c_m", { answer: "yes", projectId: "p_m", lead: "L. Brandt", leadUserId: "u_lb", title: "Changeover cart" }));
    expect(out.map((m) => [m.to, m.subject])).toEqual([
      ["js@acme.test", "Your idea was accepted: Shorter changeover"],
      ["lb@acme.test", "You lead P-1: Changeover cart"],
    ]);
    expect(out[0].text).toContain("https://acme.sellux.ch/projects/p_m");
  });

  it("the author hears the measure with its numbers, also when worse", () => {
    const P = (type: CaseEventType, payload: EventPayload = {}, day = 0) => ev(type, "L. Brandt", "p_m", payload, day);
    const before = [
      ev("case.decided", "T. Vogel", "c_m", { answer: "yes", projectId: "p_m", lead: "L. Brandt", leadUserId: "u_lb" }),
      P("project.baseline", { metric: "Changeover", unit: "min", value: 42, better: "down" }), P("project.started"), P("project.done", {}, 1),
    ];
    const out = mails(P("project.measured", { check: 30, value: 45 }, 31), ...before);
    expect(out).toHaveLength(1);
    expect(out[0].to).toBe("js@acme.test");
    expect(out[0].text).toContain("measured after 30 days: worse. Changeover: 42 → 45 min");
  });

  it("a question goes to the raiser with its text, never to who asked", () => {
    const out = mails(ev("case.asked", "T. Vogel", "c_m", { text: "Which line is it?" }));
    expect(out.map((m) => [m.to, m.subject])).toEqual([["js@acme.test", "A question about your idea: Shorter changeover"]]);
    expect(out[0].text).toContain("T. Vogel asks before deciding:");
    expect(out[0].text).toContain("  Which line is it?");
    expect(out[0].text).toContain("The answer date waits for your reply: https://acme.sellux.ch/cases/c_m");
  });

  it("the answer goes back to who asked, never to the raiser who wrote it", () => {
    const asked = ev("case.asked", "T. Vogel", "c_m", { text: "Which line is it?" });
    const out = mails(ev("case.answered", AUTHOR, "c_m", { text: "Line 3" }, 1), asked);
    expect(out.map((m) => [m.to, m.subject])).toEqual([["tv@acme.test", "Your question was answered: Shorter changeover"]]);
    expect(out[0].text).toContain("  Line 3");
    expect(out[0].text).toContain("The idea is open on the desk again");
  });

  it("a pass tells the raiser who has it now and why", () => {
    const out = mails(ev("case.handed", "T. Vogel", "c_m", { to: "H. Sander", why: "Quality owns the form" }));
    expect(out.map((m) => [m.to, m.subject])).toEqual([["js@acme.test", "Your idea was passed on: Shorter changeover"]]);
    expect(out[0].text).toContain("T. Vogel passed your idea to H. Sander. The answer date stays.");
    expect(out[0].text).toContain("Why: Quality owns the form");
  });

  it("the clock's own hand-over sends nothing here: its reminder tells them", () => {
    const byClock: CaseEvent = { id: "clk", ts: 0, type: "case.handed", actor: "system:clock", actorUserId: null, target: "c_m", payload: { to: "H. Sander", why: "deadline" }, day: 6 };
    expect(mails(byClock)).toEqual([]);
  });

  it("the clock's hand-over off a desk nobody sits at tells the raiser who has it", () => {
    const off: CaseEvent = { id: "vac", ts: 0, type: "case.handed", actor: "system:clock", actorUserId: null, target: "c_m", payload: { to: "H. Sander", why: "vacant" }, day: 0 };
    const out = mails(off);
    expect(out.map((m) => [m.to, m.subject])).toEqual([["js@acme.test", "Your idea was passed on: Shorter changeover"]]);
    expect(out[0].text).toContain("Nobody holds the desk you raised this to right now, so H. Sander has it. The answer date stays.");
    expect(out[0].text).not.toContain("system:clock");
  });

  it("a no tells the raiser the reason in words, with the line the desk wrote", () => {
    const out = mails(ev("case.decided", "T. Vogel", "c_m", { answer: "no", reason: "no time", note: "Ask again in spring" }));
    expect(out.map((m) => [m.to, m.subject])).toEqual([["js@acme.test", "Your idea was declined: Shorter changeover"]]);
    expect(out[0].text).toContain("T. Vogel said no. Reason: No time this quarter - Ask again in spring");
    expect(out[0].text).toContain("https://acme.sellux.ch/cases/c_m");
    const bare = mails(ev("case.decided", "T. Vogel", "c_m", { answer: "no" }));
    expect(bare[0].text).toContain("Reason: none given");
  });

  it("a yes that opens no project still tells the raiser", () => {
    const out = mails(ev("case.decided", "T. Vogel", "c_m", { answer: "yes" }));
    expect(out.map((m) => [m.to, m.subject])).toEqual([["js@acme.test", "Your idea was accepted: Shorter changeover"]]);
    expect(out[0].text).toContain("T. Vogel said yes.");
  });

  it("other events send nothing", () => {
    expect(mails(ev("case.read", "T. Vogel", "c_m"))).toEqual([]);
  });
});
