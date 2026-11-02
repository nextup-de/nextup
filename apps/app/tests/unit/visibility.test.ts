// The visibility rule's keys and viewer keys, on plain ids (the case-level proof is tests/unit/vis/rule.test.ts).
import { describe, expect, it } from "vitest";
import type { Me } from "@/features/auth/identity";
import { unitsOf, viewerKeys } from "@/features/cases/visibility";

const me: Me = { userId: "u1", seatIds: ["s1", "s2"], roleIds: ["r1", "r2"] };
const roles = [
  { id: "r1", orgUnitId: "n1", reportsToId: null },
  { id: "r2", orgUnitId: "n1", reportsToId: "r1" },
  { id: "r3", orgUnitId: "n2", reportsToId: "r1" },
];

describe("unitsOf", () => {
  it("lists the units of the viewer's roles once", () => expect(unitsOf(me, { roles })).toEqual(["n1"]));
  it("is empty for nobody", () => expect(unitsOf({ userId: null, seatIds: [], roleIds: [] }, { roles })).toEqual([]));
});

describe("viewerKeys", () => {
  it("a member carries their id, roles, units and all", () => expect(viewerKeys(me, "member", ["n1"]).sort()).toEqual(["all", "n:n1", "r:r1", "r:r2", "u:u1"]));
  it("a manager also carries m", () => expect(viewerKeys(me, "manager", []).includes("m")).toBe(true));
  it("nobody has no user key", () => expect(viewerKeys({ userId: null, seatIds: [], roleIds: [] }, "member", [])).toEqual(["all"]));
});
