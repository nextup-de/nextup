import { describe, expect, it } from "vitest";
import { DEMO_GOALS } from "@/features/demo/structure";
import { SEED } from "@/features/demo/seed";
import { holdersOfRole, rowsFromSeed, seedParts, type Knowledge } from "@/features/knowledge";

function fresh(): Knowledge {
  let n = 0;
  return rowsFromSeed(SEED, DEMO_GOALS, () => "id" + n++);
}

describe("DIR deputy from the manager chain", () => {
  // The first rule loses its deputy role; its owner seat is held by u-owner, another role's seat by u-boss.
  const setup = (managed: boolean) => {
    const k = fresh();
    const rule = k.rules[0];
    rule.deputyRoleId = null;
    const ownerSeat = holdersOfRole(k, rule.ownerRoleId)[0];
    const bossSeat = k.holders.find((h) => h.roleId !== rule.ownerRoleId)!;
    ownerSeat.userId = "u-owner";
    bossSeat.userId = "u-boss";
    if (managed) k.managers = [{ userId: "u-owner", managerId: "u-boss" }];
    return { k, rule, bossSeat };
  };

  it("gives a route without a deputy role the manager's seat", () => {
    const { k, rule, bossSeat } = setup(true);
    const route = seedParts(k).routes.find((r) => r.id === rule.key)!;
    expect(route.deputySeatId).toBe(bossSeat.id);
    expect(route.deputyRoleId).toBe(bossSeat.roleId);
    expect(route.deputy).toBe(bossSeat.name);
  });

  it("leaves the deputy empty when the owner has no manager", () => {
    const { k, rule } = setup(false);
    const route = seedParts(k).routes.find((r) => r.id === rule.key)!;
    expect(route.deputyRoleId).toBeNull();
    expect(route.deputySeatId).toBeNull();
  });

  it("keeps a deputy role the rule has", () => {
    const { k, rule } = setup(true);
    const other = k.roles.find((r) => r.id !== rule.ownerRoleId)!;
    rule.deputyRoleId = other.id;
    const route = seedParts(k).routes.find((r) => r.id === rule.key)!;
    expect(route.deputyRoleId).toBe(other.id);
    expect(route.deputySeatId).toBe(holdersOfRole(k, other.id)[0].id);
  });
});
