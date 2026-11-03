import { describe, expect, it } from "vitest";
import { NO_KNOWLEDGE, type Knowledge, type UnitRow } from "@/features/knowledge";
import { orgSummary, unitTree, unitsWithVacancy, visibleRows } from "@/features/settings/org-view";

const unit = (id: string, name: string, parentId: string | null, sort = 0): UnitRow => ({ id, key: id.toUpperCase(), name, kind: "dept", headcount: 0, parentId, sort });
const units = [unit("b", "Werk Nord", "a", 1), unit("a", "Acme", null), unit("c", "Quality", "d"), unit("d", "Werk Süd", "a", 0)];

describe("org view", () => {
  it("orders the tree by parent and sort", () => {
    expect(unitTree(units).map((r) => `${r.depth}${r.unit.id}${r.hasChildren ? "+" : ""}`)).toEqual(["0a+", "1d+", "2c", "1b"]);
  });

  it("hides children of closed units, and a search keeps the ancestors", () => {
    const rows = unitTree(units);
    expect(visibleRows(rows, units, new Set(["a"]), "").map((r) => r.unit.id)).toEqual(["a", "d", "b"]);
    expect(visibleRows(rows, units, new Set(), "qual").map((r) => r.unit.id)).toEqual(["a", "d", "c"]);
  });

  it("counts units, roles and vacant seats", () => {
    const k: Knowledge = {
      ...NO_KNOWLEDGE,
      units,
      roles: [{ id: "r1", orgUnitId: "c", title: "Lead", reportsToId: null, decides: [], spendLimitEur: null, skills: [], sort: 0 }],
      holders: [
        { id: "h1", roleId: "r1", name: "Anna", userId: "u1", sort: 0 },
        { id: "h2", roleId: "r1", name: "Seat 2", userId: null, sort: 1 },
      ],
    };
    expect(orgSummary(k)).toEqual({ units: 4, roles: 1, vacantSeats: 1 });
    expect([...unitsWithVacancy(k)]).toEqual(["c"]);
  });
});
