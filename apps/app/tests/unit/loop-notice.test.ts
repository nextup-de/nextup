// Who gets which mail after the routing (features/loop/notice.ts).
import { describe, expect, it } from "vitest";
import type { CaseEvent, CaseEventType, EventLog, EventPayload } from "@/features/cases/events";
import { reduce, type ReduceSeed } from "@/features/cases/reducer";
import { CASES, IDEAS, PROBLEMS, PROMISE_DAYS, ROUTES } from "@/features/demo/seed";
import { loopMails, loopNotices, type Person } from "@/features/loop/notice";

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
  it("other events send nothing", () => {
    expect(mails(ev("case.read", "T. Vogel", "c_m"))).toEqual([]);
  });
});

describe("loopNotices", () => {
  const asked = () => ev("case.asked", "T. Vogel", "c_m", { text: "Which line is it?" });
  const noticesFor = (list: Parameters<typeof loopNotices>[0]["people"], last: CaseEvent) =>
    loopNotices({ ev: last, state: reduce(SEED, { events: [raised, last], day: last.day }), people: list, baseUrl: "https://acme.sellux.ch" });

  it("keeps a person without an address, by user id, where loopMails has nobody to write to", () => {
    const last = asked();
    const list = people.map((p) => (p.id === "u_js" ? { ...p, email: null } : p));
    expect(noticesFor(list, last).map((x) => [x.userId, x.to])).toEqual([["u_js", null]]);
    expect(loopMails({ ev: last, state: reduce(SEED, { events: [raised, last], day: 0 }), people: people.map((p) => (p.id === "u_js" ? { ...p, email: "" } : p)), baseUrl: "https://acme.sellux.ch" })).toEqual([]);
  });

  it("two people sharing an address each get a notice; the mail goes to the address once", () => {
    const last = ev("case.discussion", "T. Vogel", "c_m", { invited: ["H. Sander", "L. Brandt"], invitedUserIds: ["u_hs", "u_lb"] });
    const shared = people.map((p) => (p.id === "u_lb" ? { ...p, email: "hs@acme.test" } : p));
    const state = reduce(SEED, { events: [raised, last], day: 0 });
    expect(loopNotices({ ev: last, state, people: shared, baseUrl: "x" }).map((x) => x.userId)).toEqual(["u_hs", "u_lb", "u_js"]);
    expect(loopMails({ ev: last, state, people: shared, baseUrl: "x" }).map((m) => m.to)).toEqual(["hs@acme.test", "js@acme.test"]);
  });

  it("never tells whoever did it, by id", () => {
    const last = ev("case.asked", AUTHOR, "c_m", { text: "x" });
    expect(noticesFor(people, last)).toEqual([]);
  });
});
