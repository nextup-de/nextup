// The department next to a handle: kept only when the raiser's own unit has at least MIN_GROUP people.
// At write time (stampDept) and for events already stored, as they leave the server (hideSmallDepts).
import { describe, expect, it } from "vitest";
import { deptIsBigEnough, hideSmallDepts, namesDeptUnderHandle, NO_UNITS, raiserDept, stampDept, underHandle, unitPeople, type DeptOrg } from "@/features/cases/stamp";
import { MIN_GROUP } from "@/features/metrics/types";

const members = (unitId: string | null, ...ids: string[]) => ids.map((userId) => ({ userId, unitId }));
// "big": five people without a seat. "small": three without a seat and the lead on a seat. "plant" holds both
// plus its own head. "team" is one person and the lead's second seat; "u_free" names no unit at all.
const org: DeptOrg = {
  units: [{ id: "plant", parentId: null }, { id: "big", parentId: "plant" }, { id: "small", parentId: "plant" }, { id: "team", parentId: null }],
  roles: [{ id: "r_head", orgUnitId: "plant" }, { id: "r_lead", orgUnitId: "small" }, { id: "r_team", orgUnitId: "team" }],
  seats: [{ roleId: "r_head", userId: "u_head" }, { roleId: "r_lead", userId: "u_lead" }, { roleId: "r_team", userId: "u_lead" }],
  members: [...members("big", "b1", "b2", "b3", "b4", "b5"), ...members("small", "s1", "s2", "s3"), ...members("team", "t1"), ...members(null, "u_free")],
};
const people = unitPeople(org);
const raised = { title: "Guard is loose", body: "b", routeId: "r1", fromDept: "Line 3" };

describe("unitPeople", () => {
  it("counts the active people of a unit: seats and people without one, sub-units included, nobody twice", () => {
    expect(people.ofUnit("big")).toBe(5);
    expect(people.ofUnit("small")).toBe(4);
    expect(people.ofUnit("plant")).toBe(10);
    expect(people.ofUnit("team")).toBe(2); // a person with seats in two units counts in both, as in the metrics
    expect(people.ofUnit("gone")).toBe(0);
  });

  it("a person's unit is the unit of their first seat, else the one their department names", () => {
    expect(people.ofUser("b1")).toBe(5);
    expect(people.ofUser("s1")).toBe(4);
    expect(people.ofUser("u_lead")).toBe(4); // the lead's first seat is in "small", the second does not move them
    expect(people.ofUser("u_head")).toBe(10);
  });

  it("no unit: null, for a person whose department names none, a stranger and nobody", () => {
    for (const id of ["u_free", "u_unknown", null, undefined]) expect(people.ofUser(id)).toBeNull();
    expect(NO_UNITS.ofUser("b1")).toBeNull();
  });
});

describe("stampDept (write time)", () => {
  const by = (label: string, userId: string | null) => stampDept("case.raised", raised, { label, userId }, people);

  it(`hides the department of a unit of ${MIN_GROUP - 1}, keeps it for a unit of ${MIN_GROUP}`, () => {
    expect(by("Anonymous #4471", "s1")).toEqual({ ...raised, fromDept: "" });
    expect(by("Anonymous #4471", "b1")).toEqual(raised);
    expect([deptIsBigEnough(MIN_GROUP - 1), deptIsBigEnough(MIN_GROUP), deptIsBigEnough(null)]).toEqual([false, true, false]);
  });

  it("hides it for a raiser without a unit", () => {
    expect(by("Anonymous #0001", "u_free").fromDept).toBe("");
    expect(by("Anonymous #0001", "u_unknown").fromDept).toBe("");
    expect(by("Anonymous #0001", null).fromDept).toBe("");
  });

  it("leaves a named raiser's payload as it is, also from a small unit", () => {
    expect(by("T. Vogel", "u_lead")).toBe(raised);
    expect(by("J. Schmidt", "u_free")).toBe(raised);
    expect([underHandle("Anonymous #4471"), underHandle("T. Vogel"), underHandle("system:floor")]).toEqual([true, false, false]);
  });

  it("never reads the label: a small unit stays hidden whatever the browser called it", () => {
    for (const fromDept of ["big", "Production, 400 people", "plant"]) {
      expect(stampDept("case.raised", { ...raised, fromDept }, { label: "Anonymous #4471", userId: "s2" }, people).fromDept).toBe("");
    }
  });

  it("touches nothing else: other event types, a raise without a department, the other fields", () => {
    const comment = { text: "me too", fromDept: "Line 3" };
    expect(stampDept("case.commented", comment, { label: "Anonymous #4471", userId: "s1" }, people)).toBe(comment);
    const bare = { title: "T", fromDept: "" };
    expect(stampDept("case.raised", bare, { label: "Anonymous #4471", userId: "s1" }, people)).toBe(bare);
    expect(by("Anonymous #4471", "s1")).toMatchObject({ title: raised.title, body: "b", routeId: "r1" });
  });
});

describe("hideSmallDepts (events already stored, on the way out)", () => {
  const row = (type: string, actor: string, actorUserId: string | null, payload: Record<string, unknown>) => ({ id: actor + type, type, actor, actorUserId, payload });
  const small = row("case.raised", "Anonymous #4471", "s1", { ...raised });
  const big = row("case.raised", "Anonymous #2002", "b1", { ...raised });
  const free = row("case.raised", "Anonymous #3003", "u_free", { ...raised });
  const named = row("case.raised", "T. Vogel", "u_lead", { ...raised });
  const floor = row("case.raised", "system:floor", null, { ...raised });
  const comment = row("case.commented", "Anonymous #4471", "s1", { text: "x", fromDept: "Line 3" });
  const depts = (rows: readonly { payload: unknown }[]) => rows.map((r) => (r.payload as { fromDept?: string }).fromDept);

  it("blanks the department of a raise under a handle from a small unit or from no unit, and of nothing else", () => {
    const out = hideSmallDepts([small, big, free, named, floor, comment], people);
    expect(depts(out)).toEqual(["", "Line 3", "", "Line 3", "Line 3", "Line 3"]);
    expect(out[0]).toMatchObject({ id: small.id, actor: "Anonymous #4471", actorUserId: "s1", payload: { title: raised.title, routeId: "r1" } });
  });

  it("copies: the stored row keeps what it was written with", () => {
    const out = hideSmallDepts([small], people);
    expect(out[0]).not.toBe(small);
    expect(small.payload.fromDept).toBe("Line 3");
  });

  it("hands back the same rows when no raise under a handle names a department", () => {
    const rows = [named, floor, comment, row("case.raised", "Anonymous #4471", "s1", { title: "T", fromDept: "" })];
    expect(hideSmallDepts(rows, people)).toBe(rows);
    expect(rows.map(namesDeptUnderHandle)).toEqual([false, false, false, false]);
    expect(namesDeptUnderHandle(small)).toBe(true);
  });

  it("follows today's org: the unit that grew to five shows its department again", () => {
    const grown = unitPeople({ ...org, members: [...org.members, ...members("small", "s4")] });
    expect(depts(hideSmallDepts([small], grown))).toEqual(["Line 3"]);
    expect(depts(hideSmallDepts([big], NO_UNITS))).toEqual([""]);
  });
});

describe("raiserDept (Teams and API v1 raises)", () => {
  it("names the raiser's own department next to their name, also from a small unit, as the web raise does", () => {
    expect(raiserDept("Line 3", { label: "T. Vogel", userId: "u_lead" }, people)).toBe("Line 3");
    expect(raiserDept("  Logistics ", { label: "J. Schmidt", userId: "u_free" }, people)).toBe("Logistics");
  });

  it("next to a handle or system:api, keeps it only for a unit of at least MIN_GROUP", () => {
    expect(raiserDept("Big", { label: "Anonymous #4471", userId: "b1" }, people)).toBe("Big");
    expect(raiserDept("Small", { label: "Anonymous #4471", userId: "s1" }, people)).toBe("");
    expect(raiserDept("Big", { label: "system:api", userId: "b1" }, people)).toBe("Big");
    expect(raiserDept("Small", { label: "system:api", userId: "s1" }, people)).toBe("");
    expect(raiserDept("Free", { label: "system:api", userId: "u_free" }, people)).toBe("");
  });

  it("no person or no department: none", () => {
    expect(raiserDept("Line 3", { label: "system:api", userId: null }, people)).toBe("");
    expect(raiserDept("", { label: "T. Vogel", userId: "u_lead" }, people)).toBe("");
    expect(raiserDept(null, { label: "T. Vogel", userId: "u_lead" }, people)).toBe("");
  });
});
