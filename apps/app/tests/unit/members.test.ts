// Settings -> Members: who may be added, whose role may change. Pure - no database.
import { describe, expect, it } from "vitest";
import { roleChangeProblem, validateNewMember, type Member } from "@/features/tenant/members";

const people: Member[] = [
  { id: "m1", name: "P. Meier", email: "p.meier@globex.test", role: "manager" },
  { id: "l1", name: "K. Braun", email: "k.braun@globex.test", role: "leader" },
  { id: "e1", name: "S. Wolf", email: "s.wolf@globex.test", role: "member" },
];

describe("validateNewMember", () => {
  it("accepts a new person", () => {
    expect(validateNewMember({ name: "A. Novak", email: "a.novak@globex.test", role: "member" }, people)).toEqual([]);
  });

  it("refuses an email already in the company, ignoring case", () => {
    expect(validateNewMember({ name: "Other", email: "K.Braun@globex.test", role: "member" }, people)).toHaveLength(1);
  });

  it("needs a name, a real address and a known role", () => {
    const problems = validateNewMember({ name: " ", email: "nope", role: "owner" as Member["role"] }, people);
    expect(problems).toHaveLength(3);
  });
});

describe("roleChangeProblem", () => {
  it("lets a manager promote a member", () => {
    expect(roleChangeProblem(people, "m1", "e1", "leader")).toBeNull();
  });

  it("is a no-op, not an error, when the role does not change", () => {
    expect(roleChangeProblem(people, "m1", "m1", "manager")).toBeNull();
  });

  it("stops a manager changing their own role", () => {
    const two = [...people, { id: "m2", name: "R. Lang", email: "r.lang@globex.test", role: "manager" as const }];
    expect(roleChangeProblem(two, "m1", "m1", "member")).toMatch(/own role/);
  });

  it("never leaves the company without a manager", () => {
    // Only reachable through another manager in theory, but the rule holds on its own.
    expect(roleChangeProblem(people, "x", "m1", "leader")).toMatch(/only manager/);
  });

  it("refuses an unknown role or person", () => {
    expect(roleChangeProblem(people, "m1", "e1", "owner")).not.toBeNull();
    expect(roleChangeProblem(people, "m1", "nobody", "leader")).not.toBeNull();
  });
});
