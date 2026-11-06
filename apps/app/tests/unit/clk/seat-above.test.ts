// The seat the second escalation level hands a case to (features/knowledge seatAbove).
import { describe, expect, it } from "vitest";
import { seatAbove, type HolderRow, type RoleRow } from "@/features/knowledge";

const role = (id: string, reportsToId: string | null): RoleRow => ({ id, orgUnitId: "u1", title: id, reportsToId, decides: [], spendLimitEur: null, skills: [], sort: 0 });
const seat = (id: string, roleId: string, userId: string | null, sort = 0): HolderRow => ({ id, roleId, name: id, userId, sort });

const roles = [role("desk", "lead"), role("lead", "head"), role("head", null), role("side", null)];

describe("seatAbove", () => {
  it("takes the first occupied seat of the role the desk reports to", () => {
    const holders = [seat("s_desk", "desk", "u1"), seat("s_lead2", "lead", "u3", 2), seat("s_lead1", "lead", "u2", 1), seat("s_head", "head", "u4")];
    expect(seatAbove({ roles, holders }, "desk")?.id).toBe("s_lead1");
  });

  it("skips a vacant seat and a role that holds the case already, and walks on up", () => {
    const holders = [seat("s_desk", "desk", "u1"), seat("s_lead", "lead", null), seat("s_head", "head", "u4")];
    expect(seatAbove({ roles, holders }, "desk")?.id).toBe("s_head");
    const full = [seat("s_desk", "desk", "u1"), seat("s_lead", "lead", "u2"), seat("s_head", "head", "u4")];
    expect(seatAbove({ roles, holders: full }, "desk", ["lead"])?.id).toBe("s_head");
    expect(seatAbove({ roles, holders: full }, "desk", ["lead", "head"])).toBeNull();
  });

  it("nobody above: null, also for a role the company does not have and for a reporting loop", () => {
    const holders = [seat("s_head", "head", "u4")];
    expect(seatAbove({ roles, holders }, "head")).toBeNull();
    expect(seatAbove({ roles, holders }, "gone")).toBeNull();
    const loop = [role("a", "b"), role("b", "a")];
    expect(seatAbove({ roles: loop, holders: [seat("s_a", "a", "u1"), seat("s_b", "b", null)] }, "a")).toBeNull();
  });

  it("without a boss on the org chart it follows the directory: the manager of the person on the desk, then theirs", () => {
    const flat = [role("desk", null), role("side", null), role("top", null)];
    const holders = [seat("s_desk", "desk", "u1"), seat("s_side", "side", "u2"), seat("s_top", "top", "u9")];
    expect(seatAbove({ roles: flat, holders, managers: [{ userId: "u1", managerId: "u2" }] }, "desk")?.id).toBe("s_side");
    // The manager has no seat: their manager's seat.
    expect(seatAbove({ roles: flat, holders, managers: [{ userId: "u1", managerId: "u5" }, { userId: "u5", managerId: "u9" }] }, "desk")?.id).toBe("s_top");
    expect(seatAbove({ roles: flat, holders, managers: [{ userId: "u1", managerId: "u2" }] }, "desk", ["side"])).toBeNull();
    expect(seatAbove({ roles: flat, holders, managers: [{ userId: "u1", managerId: "u1" }] }, "desk")).toBeNull();
  });
});
