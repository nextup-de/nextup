import { describe, expect, it } from "vitest";
import { jitSeatRole } from "@/features/auth/entra";
import { SEED } from "@/features/demo/seed";
import { DEMO_GOALS } from "@/features/demo/structure";
import { rowsFromSeed } from "@/features/knowledge";

const counter = () => { let n = 0; return () => "id" + ++n; };

describe("IDN JIT seat plan", () => {
  const k = rowsFromSeed(SEED, DEMO_GOALS, counter());
  // The labels are read here only to name the fixture's roles.
  const roleOf = (label: string) => k.holders.find((h) => h.name === label)?.roleId;

  it("gives a leader or manager the top role of the unit, by name or key", () => {
    expect(roleOf("M. Roth")).toBeTruthy();
    expect(jitSeatRole(k, "engineering", "leader")).toBe(roleOf("M. Roth"));
    expect(jitSeatRole(k, "ENG", "manager")).toBe(roleOf("M. Roth"));
  });

  it("takes a role that reports to a role of another unit as the top", () => {
    expect(jitSeatRole(k, "Production", "leader")).toBe(roleOf("B. Hartmann"));
  });

  it("gives nothing to a member, an empty or unknown department, or a unit without roles", () => {
    expect(jitSeatRole(k, "Engineering", "member")).toBeNull();
    expect(jitSeatRole(k, "", "leader")).toBeNull();
    expect(jitSeatRole(k, "Marketing", "leader")).toBeNull();
    const empty = { units: [{ id: "u", key: "X", name: "Empty", sort: 0 }], roles: [] };
    expect(jitSeatRole(empty, "Empty", "manager")).toBeNull();
  });
});
