// Administrators of a project (rights PR, 25 Nov 2026): who names them, what they may do, and what stays with the lead.
import { describe, expect, it } from "vitest";
import { meFor } from "@/features/auth/identity";
import type { CaseEvent, EventPayload } from "@/features/cases/events";
import { mayAppend, type Actor } from "@/features/cases/permissions";
import type { State } from "@/features/cases/reducer";
import { ev, SEATS, startedLog, stateOf } from "@/features/projects/project-fixture";

const DAY = 20;
const member = (userId: string, payload: EventPayload): CaseEvent => ev("project.member", "L. Brandt", "p_one", { userId, name: userId, ...payload }, 11);
const TEAM = ["u_ad", "u_ad2", "u_ci"].map((u) => member(u, { on: true }));
const ADMINS = ["u_ad", "u_ad2"].map((u) => member(u, { admin: true }));
const world = (...more: CaseEvent[]): State => stateOf([...startedLog(), ...TEAM, ...ADMINS, ev("project.step.added", "L. Brandt", "p_one", { stepId: "s1", text: "Step", owner: "L. Brandt", ownerUserId: "u_lb" }, 11), ...more], DAY);
const may = (userId: string, type: string, payload: EventPayload, state: State = world()): boolean => {
  const actor: Actor = { role: "member", name: userId, handle: null, userId, me: meFor(userId, SEATS) };
  return mayAppend(actor, { type, target: "p_one", payload }, state).ok;
};
const admins = (state: State) => state.projects.find((p) => p.id === "p_one")!.adminUserIds;

describe("project administrators", () => {
  it("only the lead names one, and only someone on the team", () => {
    expect(may("u_lb", "project.member", { userId: "u_ci", admin: true })).toBe(true);
    expect(may("u_lb", "project.member", { userId: "u_xx", admin: true })).toBe(false);
    for (const who of ["u_ad", "u_ci", "u_js", "u_xx"]) expect(may(who, "project.member", { userId: "u_ci", admin: true }), who).toBe(false);
    expect(may("u_lb", "project.member", { userId: "u_ci", admin: true, on: true })).toBe(false);
  });

  it("an administrator adds and removes people, moves any step, pauses and stops", () => {
    expect(may("u_ad", "project.member", { userId: "u_new", on: true })).toBe(true);
    expect(may("u_ad", "project.member", { userId: "u_ci", on: false })).toBe(true);
    expect(may("u_ad", "project.step.moved", { stepId: "s1", to: "doing" })).toBe(true);
    expect(may("u_ad", "project.step.edited", { stepId: "s1", removed: true })).toBe(true);
    expect(may("u_ad", "project.paused", { untilDay: DAY + 5, why: "Parts are late" })).toBe(true);
    expect(may("u_ad", "project.stopped", { why: "No longer needed" })).toBe(true);
    for (const type of ["project.paused", "project.stopped"]) expect(may("u_ci", type, { untilDay: DAY + 5, why: "x" }), type).toBe(false);
  });

  it("takes no other administrator and no sponsor off, but may leave", () => {
    expect(may("u_ad", "project.member", { userId: "u_ad2", on: false })).toBe(false);
    expect(may("u_ad", "project.member", { userId: "u_ad", on: false })).toBe(true);
    expect(may("u_lb", "project.member", { userId: "u_ad2", on: false })).toBe(true);
    const s = world();
    s.projects.find((p) => p.id === "p_one")!.sponsorUserId = "u_sp";
    expect(may("u_ad", "project.member", { userId: "u_sp", on: false, unassign: true }, s)).toBe(false);
  });

  it("the hand-over, the done, the numbers and the Jira sync stay with the lead", () => {
    const rest: [string, EventPayload][] = [["project.handed", { toUserId: "u_ad", to: "u_ad" }], ["project.done", { openSteps: [{ stepId: "s1", end: "done" }] }], ["project.sync", { system: "jira", on: true }], ["project.howwework", { checkInWeekday: 1 }]];
    for (const [type, payload] of rest) {
      expect(may("u_lb", type, payload), type).toBe(true);
      expect(may("u_ad", type, payload), type).toBe(false);
    }
  });

  it("off the team or made lead, the role is gone and does not come back", () => {
    expect(admins(world(member("u_ad", { on: false }), member("u_ad", { on: true })))).toEqual(["u_ad2"]);
    expect(admins(world(member("u_ad", { admin: false })))).toEqual(["u_ad2"]);
    const handed = world(ev("project.handed", "L. Brandt", "p_one", { toUserId: "u_ad", to: "u_ad" }, 12));
    expect(admins(handed)).toEqual(["u_ad2"]);
    expect(may("u_ad2", "project.paused", { untilDay: DAY + 5, why: "x" }, handed)).toBe(true);
  });
});
