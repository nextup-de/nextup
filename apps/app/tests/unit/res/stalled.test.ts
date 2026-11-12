// RES-K1 (B1): the Dashboard breakdown counts the stalled projects per unit (plan RES, D22). Literal inputs only.
import { describe, expect, it } from "vitest";
import { breakdown } from "@/features/metrics/breakdown";
import { stalledOf } from "@/features/metrics/stalled";
import { MIN_GROUP, type LedgerInput } from "@/features/metrics/types";
import type { ReducedProject } from "@/features/projects/types";

const unit = (id: string, parentId: string | null, people: number) => ({ id, name: id, parentId, people, headcount: people });
// Plant (20) > A (8), B (7), C (3). C is under MIN_GROUP; with exactly one hidden child, the smallest visible sibling (B) is hidden too.
const input = (stalled: LedgerInput["stalled"], today = 100): LedgerInput => ({
  cases: [], facts: { answers: { yes: 0, yesProject: 0, question: 0, handed: 0, no: 0 }, override: { proposed: 0, overridden: 0, rate: null } },
  org: {
    units: [unit("plant", null, 20), unit("a", "plant", 8), unit("b", "plant", 7), unit("c", "plant", 3)],
    roles: [{ id: "r_big", title: "Lead", unitId: "a", people: 6 }, { id: "r_small", title: "Tech", unitId: "c", people: 2 }],
  },
  promiseDays: 5, today, demoClock: false, stalled,
});
const STALLED = [
  { projectId: "p1", unitId: "a" }, { projectId: "p2", unitId: "a" }, { projectId: "p3", unitId: "b" }, { projectId: "p4", unitId: "c" },
  { projectId: "p5", unitId: "plant" }, { projectId: "p6", unitId: null }, { projectId: "p7", unitId: "elsewhere" },
];
const period = { from: 71, to: 100 };
const rows = (i: LedgerInput, p = period) => Object.fromEntries(breakdown(i, p, "unit").map((r) => [r.id, r]));

describe("RES stalled", () => {
  it("each unit row counts the stalled projects of its subtree, rolled up to its parents", () => {
    const r = rows(input(STALLED));
    expect(MIN_GROUP).toBe(5);
    expect(r.plant).toMatchObject({ hidden: false, stalled: 1 + 2 + 1 + 1 }); // its own, A's two, B's one and C's one; none without a unit or in an unknown one
    expect(r.a).toMatchObject({ hidden: false, stalled: 2 });
  });

  it("a hidden row shows none: the one under MIN_GROUP and the sibling hidden with it, while the parent still counts them", () => {
    const r = rows(input(STALLED));
    expect(r.c).toMatchObject({ hidden: true, stalled: null });
    expect(r.b).toMatchObject({ hidden: true, stalled: null }); // complementary suppression
    expect(r.plant.stalled).toBe(5);
  });

  it("is null for a past period and for role rows, and 0 where nothing stalls", () => {
    expect(rows(input(STALLED), { from: 40, to: 70 }).a.stalled).toBeNull();
    expect(rows(input(STALLED), { from: 71, to: 99 }).plant.stalled).toBeNull(); // not ending today
    for (const r of breakdown(input(STALLED), period, "role")) expect(r.stalled, r.id).toBeNull();
    expect(rows(input([])).plant.stalled).toBe(0);
    expect(rows(input([])).a.stalled).toBe(0);
  });

  it("does not change the other columns", () => {
    const a = rows(input([]));
    const b = rows(input(STALLED));
    for (const id of Object.keys(a)) expect({ ...b[id], stalled: 0 }).toEqual({ ...a[id], stalled: 0 });
  });

  describe("stalledOf", () => {
    const project = (id: string, over: Partial<ReducedProject>) => ({
      id, status: "running", sources: ["c_" + id], escalated: { to: "K. Head", toSeatId: "s", toRoleId: "r", from: "L", day: 5, live: true, what: "stalled" }, ...over,
    }) as unknown as ReducedProject;
    const unitOfCase = (id: string) => ({ c_p1: "a", c_p2: "b", c_first: "a", c_second: "c" })[id as "c_p1"] ?? null;

    it("takes the projects whose stalled escalation stands, in the unit of their first source case", () => {
      const projects = [
        project("p1", {}), // stalled
        project("p2", { escalated: null }), // quiet only: no escalation
        project("p3", { escalated: { to: "", toSeatId: null, toRoleId: null, from: "L", day: 5, live: true, what: "measure" } }), // another kind
        project("p4", { escalated: { to: "", toSeatId: null, toRoleId: null, from: "L", day: 5, live: true, what: "draft" } }),
        project("p5", { status: "stopped" }), // stopped
        project("p6", { sources: ["c_first", "c_second"] }), // first source
        project("p7", { sources: [] }), // no source: counts in no unit
        project("p8", { sources: ["c_unknown"] }),
      ];
      expect(stalledOf(projects, unitOfCase)).toEqual([
        { projectId: "p1", unitId: "a" }, { projectId: "p6", unitId: "a" }, { projectId: "p7", unitId: null }, { projectId: "p8", unitId: null },
      ]);
    });

    it("lists no lead, person or title: only the project's id and unit", () => {
      const out = stalledOf([project("p1", { lead: "T. Vogel", title: "Secret title", leadUserId: "u_1" })], unitOfCase);
      expect(Object.keys(out[0]).sort()).toEqual(["projectId", "unitId"]);
      expect(JSON.stringify(out)).not.toContain("Vogel");
    });
  });
});
