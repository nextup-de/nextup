// FX5: the names on old events, as a browser gets them, once the person behind them has been pseudonymised.
// The event log itself is never touched (GDP D15). PILOT_CHECK I2.
import { describe, expect, it } from "vitest";
import type { SeatRow } from "@/features/auth/identity";
import { relabelEvents } from "@/features/cases/relabel";
import { planDirectoryDelta, type PlanUser } from "@/features/directory/apply";
import { reactivateProblem } from "@/features/tenant/members";

const labels = { "u-gone": "Former member 1" };
const seats: SeatRow[] = [
  { id: "s-vacated", roleId: "r1", label: "Former member 1", userId: null, sort: 0 },
  { id: "s-held", roleId: "r1", label: "New Holder", userId: "u-new", sort: 1 },
];
const ev = (actor: string, actorUserId: string | null, payload: Record<string, unknown>) => ({ actor, actorUserId, payload });
const one = (e: ReturnType<typeof ev>) => relabelEvents([e], labels, seats)[0];

describe("relabelEvents", () => {
  it("replaces the actor by their user id", () => {
    expect(one(ev("Greta Gone", "u-gone", {})).actor).toBe("Former member 1");
    expect(one(ev("Someone Else", "u-other", {})).actor).toBe("Someone Else");
  });

  it("leaves an anonymous handle and a system actor alone", () => {
    expect(one(ev("Anonymous #0001", "u-gone", {})).actor).toBe("Anonymous #0001");
    expect(one(ev("system:clock", null, {})).actor).toBe("system:clock");
  });

  it("replaces the lead, a project member, a hand-over and a step owner by their ids", () => {
    expect(one(ev("x", null, { lead: "Greta Gone", leadUserId: "u-gone" })).payload.lead).toBe("Former member 1");
    expect(one(ev("x", null, { name: "Greta Gone", userId: "u-gone" })).payload.name).toBe("Former member 1");
    expect(one(ev("x", null, { to: "Greta Gone", toUserId: "u-gone" })).payload.to).toBe("Former member 1");
    expect(one(ev("x", null, { owner: "Greta Gone", ownerUserId: "u-gone" })).payload.owner).toBe("Former member 1");
  });

  it("replaces invited names position by position when the ids line up", () => {
    const p = one(ev("x", null, { invited: ["Ann", "Greta Gone"], invitedUserIds: ["u-ann", "u-gone"] })).payload;
    expect(p.invited).toEqual(["Ann", "Former member 1"]);
  });

  it("takes a desk's name from its seat once the seat holds the pseudonym", () => {
    expect(one(ev("x", null, { assignee: "Greta Gone", assigneeRoleHolderId: "s-vacated" })).payload.assignee).toBe("Former member 1");
    expect(one(ev("x", null, { to: "Greta Gone", toRoleHolderId: "s-vacated" })).payload.to).toBe("Former member 1");
  });

  it("does not put someone else's name on an old desk", () => {
    expect(one(ev("x", null, { assignee: "Old Name", assigneeRoleHolderId: "s-held" })).payload.assignee).toBe("Old Name");
  });

  it("changes nothing when nobody has been pseudonymised, and does not touch its input", () => {
    const e = ev("Greta Gone", "u-gone", { lead: "Greta Gone", leadUserId: "u-gone" });
    expect(relabelEvents([e], {}, seats)[0]).toBe(e);
    relabelEvents([e], labels, seats);
    expect(e.actor).toBe("Greta Gone");
    expect(e.payload.lead).toBe("Greta Gone");
  });
});

describe("a directory page and a pseudonymised person", () => {
  const entry = { externalId: "sub-1", displayName: "Greta Gone", email: "greta@x.example", department: "Engineering", jobTitle: null, managerExternalId: null, groupExternalIds: [], active: true };
  const gone: PlanUser = { id: "u-gone", entraOid: null, employeeId: null, email: "former-u-gone@pseudonymised.invalid", scimSubject: "sub-1", active: false, managerId: null, dept: "", name: "Former member 1", pseudonymised: true };
  const plan = () => planDirectoryDelta({ source: "scim", page: { entries: [entry], groups: [], removedExternalIds: [], nextCursor: null }, users: [gone], units: [{ key: "ENG", name: "Engineering", sort: 0 }], takenHandles: [] });

  it("changes nothing: no comeback, no new name, no new person", () => {
    const p = plan();
    expect(p.updates).toEqual([]);
    expect(p.creates).toEqual([]);
    expect(p.links).toEqual([]);
    expect(p.managers).toEqual([]);
    expect(p.skipped).toEqual([{ externalId: "sub-1", reason: "inactive" }]);
  });
});

describe("reactivating", () => {
  it("is refused for someone pseudonymised", () => {
    expect(reactivateProblem({ name: "Former member 1", active: false, pseudonymised: true }, false)).toMatch(/pseudonymised/i);
    expect(reactivateProblem({ name: "Pat", active: false, pseudonymised: false }, false)).toBeNull();
  });
});
