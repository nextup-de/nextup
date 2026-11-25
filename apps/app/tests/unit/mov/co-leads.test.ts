// Co-leads of a project (rights PR, 25 Nov 2026, after Kevin's review): how the role is given, what it may do, what it can't reach.
import { describe, expect, it } from "vitest";
import { meFor } from "@/features/auth/identity";
import type { CaseEvent, EventPayload } from "@/features/cases/events";
import { mayAppend, type Actor } from "@/features/cases/permissions";
import type { State } from "@/features/cases/reducer";
import { ev, raised, SEATS, stateOf } from "@/features/projects/project-fixture";

const DAY = 20;
const by = (userId: string, type: CaseEvent["type"], payload: EventPayload, day = 11): CaseEvent => ({ ...ev(type, userId, "p_one", payload, day), actorUserId: userId });
const invite = (userId: string, role: "colead" | "member"): CaseEvent => ({ ...by("u_lb", "project.invited", { userId, role }), id: `i_${userId}_${role}` });
const take = (userId: string, role: "colead" | "member", yes = true): CaseEvent => by(userId, "project.invite.answered", { inviteId: `i_${userId}_${role}`, userId, take: yes });
const START: CaseEvent[] = [
  raised(),
  ev("case.decided", "T. Vogel", "c_a", { answer: "yes", projectId: "p_one", draft: true, lead: "L. Brandt", leadUserId: "u_lb", title: "Changeover cart" }),
  by("u_lb", "project.lead.answered", { take: true }, 8),
  by("u_lb", "project.goal", { goal: "Faster changeover", doneWhen: "Under 30 minutes" }, 8),
  by("u_lb", "project.baseline", { none: true, why: "No number" }, 9),
  by("u_lb", "project.started", {}, 10),
];
const CO = [invite("u_co", "colead"), take("u_co", "colead")];
const world = (...more: CaseEvent[]): State => stateOf([...START, ...CO, by("u_lb", "project.member", { userId: "u_ci", name: "C. Ilg", on: true }), by("u_lb", "project.step.added", { stepId: "s1", text: "Step", ownerUserId: "u_lb" }), ...more], DAY);
const may = (userId: string, type: string, payload: EventPayload, state: State = world(), role: Actor["role"] = "member", target = "p_one"): boolean =>
  mayAppend({ role, name: userId, handle: null, userId, me: meFor(userId, SEATS) }, { type, target, payload }, state).ok;
const p = (s: State) => s.projects.find((x) => x.id === "p_one")!;
const ADD = { userId: "u_mg", name: "M. Manager", on: true };
const LEADS: [string, EventPayload][] = [["project.done", { openSteps: [{ stepId: "s1", end: "done" }] }], ["project.handed", { toUserId: "u_ci", to: "C. Ilg" }], ["project.invited", { userId: "u_ci", role: "colead" }], ["project.stopped", { why: "x" }]];

describe("co-leads", () => {
  it("only the lead asks, and it counts only once taken", () => {
    expect(may("u_lb", "project.invited", { userId: "u_ci", role: "colead" })).toBe(true);
    for (const who of ["u_co", "u_ci", "u_xx"]) expect(may(who, "project.invited", { userId: "u_ci", role: "colead" }), who).toBe(false);
    const asked = stateOf([...START, invite("u_co", "colead")], DAY);
    expect(p(asked).coLeadUserIds ?? []).toEqual([]);
    expect(may("u_co", "project.paused", { untilDay: DAY + 5, why: "x" }, asked)).toBe(false);
    const declined = stateOf([...START, invite("u_co", "colead"), take("u_co", "colead", false)], DAY);
    expect(p(declined).coLeadUserIds ?? []).toEqual([]);
    expect(p(world()).coLeadUserIds).toEqual(["u_co"]);
    expect(may("u_lb", "project.member", { userId: "u_ci", coLead: true })).toBe(false);
  });

  it("adds people, moves any step, pauses and resumes; nothing else of the lead", () => {
    expect(may("u_co", "project.member", { userId: "u_new", name: "N", on: true })).toBe(true);
    expect(may("u_co", "project.step.moved", { stepId: "s1", to: "doing" })).toBe(true);
    expect(may("u_co", "project.paused", { untilDay: DAY + 5, why: "Parts are late" })).toBe(true);
    for (const [type, payload] of LEADS) {
      expect(may("u_lb", type, payload), type).toBe(true);
      expect(may("u_co", type, payload), type).toBe(false);
    }
    expect(may("u_co", "project.step.edited", { stepId: "s1", removed: true })).toBe(false);
  });

  it("a manager a co-lead adds is not in charge by it; one the lead adds is", () => {
    const added = world(by("u_co", "project.member", ADD, 12));
    for (const [type, payload] of LEADS) expect(may("u_mg", type, payload, added, "manager"), type).toBe(false);
    const both = world(by("u_co", "project.member", ADD, 12), by("u_lb", "project.member", ADD, 13));
    for (const [type, payload] of LEADS) expect(may("u_mg", type, payload, both, "manager"), type).toBe(true);
    // A co-lead adding them again takes nothing away from a manager the lead put there.
    const lead = world(by("u_lb", "project.member", ADD, 12), by("u_co", "project.member", ADD, 13));
    expect(may("u_mg", "project.done", LEADS[0][1], lead, "manager")).toBe(true);
  });

  it("takes off only who a co-lead added, with the lead told, or leaves", () => {
    const s = world(by("u_co", "project.member", ADD, 12));
    const off = (userId: string) => ({ userId, name: userId, on: false, unassign: true });
    expect(may("u_co", "project.member", off("u_mg"), s)).toBe(true);
    expect(may("u_co", "project.member", { userId: "u_mg", on: false }, s)).toBe(false);
    expect(may("u_co", "project.member", off("u_ci"), s)).toBe(false);
    expect(may("u_co", "project.member", off("u_co"), s)).toBe(true);
    const kept = world(by("u_lb", "project.member", ADD, 12));
    expect(may("u_co", "project.member", off("u_mg"), kept)).toBe(false);
  });

  it("the role is put down, taken back, or gone with the team, and may be asked again", () => {
    expect(may("u_co", "project.member", { userId: "u_co", coLead: false })).toBe(true);
    expect(may("u_lb", "project.member", { userId: "u_co", coLead: false })).toBe(true);
    expect(may("u_ci", "project.member", { userId: "u_co", coLead: false })).toBe(false);
    expect(p(world(by("u_lb", "project.member", { userId: "u_co", coLead: false }, 12))).coLeadUserIds).toEqual([]);
    expect(p(world(by("u_lb", "project.member", { userId: "u_co", on: false }, 12), by("u_lb", "project.member", { userId: "u_co", on: true }, 13))).coLeadUserIds).toEqual([]);
    const again = { ...invite("u_co", "colead"), id: "i_again" };
    const s = world(by("u_lb", "project.member", { userId: "u_co", coLead: false }, 12), again, by("u_co", "project.invite.answered", { inviteId: "i_again", userId: "u_co", take: true }, 14));
    expect(p(s).coLeadUserIds).toEqual(["u_co"]);
    expect(p(world(by("u_lb", "project.handed", { toUserId: "u_co", to: "Co" }, 12))).coLeadUserIds).toEqual([]);
  });
});
