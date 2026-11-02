import { describe, expect, it } from "vitest";
import { DEMO_GOALS } from "@/features/demo/structure";
import { SEED } from "@/features/demo/seed";
import { rowsFromSeed } from "@/features/knowledge";
import { checkChange } from "@/features/org-edit";

let n = 0;
const k = rowsFromSeed(SEED, DEMO_GOALS, () => "id" + ++n);
const unit = k.units[0];
const routed = k.rules[0];
const ownerRole = k.roles.find((r) => r.id === routed.ownerRoleId)!;
const role = { orgUnitId: unit.id, title: "Shift lead", reportsToId: null, decides: [], spendLimitEur: null };

describe("ADM org rules", () => {
  it("refuses a duplicate unit key", () => {
    const unitInput = { key: unit.key, name: "Again", kind: "dept", headcount: 1, parentId: null };
    expect(checkChange(k, { kind: "addUnit", unit: unitInput })).toBe("settingsOrg.errKeyDuplicate");
  });

  it("refuses a reportsTo loop", () => {
    const boss = k.roles.find((r) => r.id !== ownerRole.id)!;
    const withBoss = { ...k, roles: k.roles.map((r) => (r.id === boss.id ? { ...r, reportsToId: ownerRole.id } : r)) };
    expect(checkChange(withBoss, { kind: "updateRole", id: ownerRole.id, role: { ...role, title: ownerRole.title, reportsToId: boss.id } })).toBe("settingsOrg.errReportsLoop");
    expect(checkChange(k, { kind: "updateRole", id: ownerRole.id, role: { ...role, title: ownerRole.title, reportsToId: ownerRole.id } })).toBe("settingsOrg.errReportsLoop");
  });

  it("refuses removing a role a route still names", () => {
    expect(checkChange(k, { kind: "removeRole", id: ownerRole.id })).toBe("settingsOrg.errRoleOnRoute");
  });

  it("refuses a route without an owner role", () => {
    const route = { key: "r_new", type: "Anything", keywords: ["x"], ownerRoleId: null, deputyRoleId: null, buddyRoleId: null, wait: "" };
    expect(checkChange(k, { kind: "saveRoute", route })).toBe("settingsOrg.errRouteNoOwner");
  });

  it("accepts renaming a unit and adding a role", () => {
    expect(checkChange(k, { kind: "updateUnit", id: unit.id, unit: { name: "Renamed", kind: unit.kind, headcount: unit.headcount, parentId: unit.parentId } })).toBeNull();
    expect(checkChange(k, { kind: "addRole", role })).toBeNull();
  });
});
