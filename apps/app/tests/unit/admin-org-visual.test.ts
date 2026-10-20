// The Data page's pictures: treemap geometry, the cut-down role tree and the routing health grid.
// Run on the demo company and on a made-up 500-person one, because "it works on 16 roles" is not
// the claim - "it still fits on a screen at 500 people" is.
import { describe, expect, it } from "vitest";
import { SEED } from "@/features/demo/seed";
import { GOALS } from "@/features/evaluate";
import { NO_KNOWLEDGE, rowsFromSeed, type Knowledge } from "@/features/knowledge";
import {
  MAX_CHILDREN, MAX_ROLES, orgStats, roleForest, routingHealth, squarify, TREE_H, TREE_W, unitTiles,
  type RoleBranch,
} from "@/features/admin/org-visual";
import { largeOrg } from "../helpers/large-org";

let n = 0;
const demo: Knowledge = rowsFromSeed(SEED, GOALS, () => "id" + ++n);
const big = largeOrg(500);

const area = (r: { w: number; h: number }) => r.w * r.h;
const overlap = (a: { x: number; y: number; w: number; h: number }, b: typeof a) =>
  Math.max(0, Math.min(a.x + a.w, b.x + b.w) - Math.max(a.x, b.x)) * Math.max(0, Math.min(a.y + a.h, b.y + b.h) - Math.max(a.y, b.y));
const count = (b: RoleBranch): number => 1 + b.children.reduce((s, c) => s + count(c), 0);

describe("squarify", () => {
  const rect = { x: 0, y: 0, w: 100, h: 50 };

  it("gives every item an area in proportion to its weight and fills the rectangle", () => {
    const items = [{ id: "a", weight: 6 }, { id: "b", weight: 3 }, { id: "c", weight: 2 }, { id: "d", weight: 1 }];
    const out = squarify(items, rect);
    expect(out).toHaveLength(4);
    expect(out.reduce((s, t) => s + area(t.rect), 0)).toBeCloseTo(area(rect), 6);
    for (const t of out) expect(area(t.rect) / area(rect)).toBeCloseTo(items.find((i) => i.id === t.id)!.weight / 12, 6);
  });

  it("keeps every tile inside the rectangle and tiles apart", () => {
    const out = squarify(Array.from({ length: 40 }, (_, i) => ({ id: "t" + i, weight: 1 + (i % 7) })), rect);
    for (const t of out) {
      expect(t.rect.x).toBeGreaterThanOrEqual(-1e-9);
      expect(t.rect.y).toBeGreaterThanOrEqual(-1e-9);
      expect(t.rect.x + t.rect.w).toBeLessThanOrEqual(rect.w + 1e-9);
      expect(t.rect.y + t.rect.h).toBeLessThanOrEqual(rect.h + 1e-9);
    }
    for (let i = 0; i < out.length; i++) for (let j = i + 1; j < out.length; j++) expect(overlap(out[i].rect, out[j].rect)).toBeLessThan(1e-6);
  });

  it("makes tiles close to square rather than slivers", () => {
    const out = squarify(Array.from({ length: 12 }, (_, i) => ({ id: "t" + i, weight: 10 })), rect);
    for (const t of out) expect(Math.max(t.rect.w / t.rect.h, t.rect.h / t.rect.w)).toBeLessThan(3);
  });

  it("returns nothing for no weight or no room, and skips zero weights", () => {
    expect(squarify([], rect)).toEqual([]);
    expect(squarify([{ id: "a", weight: 0 }], rect)).toEqual([]);
    expect(squarify([{ id: "a", weight: 1 }], { x: 0, y: 0, w: 0, h: 10 })).toEqual([]);
    expect(squarify([{ id: "a", weight: 0 }, { id: "b", weight: 1 }], rect).map((t) => t.id)).toEqual(["b"]);
  });
});

describe("unitTiles", () => {
  it("draws every unit of the demo company once, inside the canvas", () => {
    const tiles = unitTiles(demo);
    expect(tiles.map((t) => t.id).sort()).toEqual(demo.units.map((u) => u.id).sort());
    for (const t of tiles) {
      expect(t.rect.x + t.rect.w).toBeLessThanOrEqual(TREE_W + 1e-9);
      expect(t.rect.y + t.rect.h).toBeLessThanOrEqual(TREE_H + 1e-9);
    }
  });

  it("sizes top-level tiles by their people", () => {
    const top = unitTiles(demo).filter((t) => t.depth === 0).sort((a, b) => b.headcount - a.headcount);
    expect(area(top[0].rect)).toBeGreaterThan(area(top[top.length - 1].rect));
  });

  it("counts the routing rows each unit owns and colours by it", () => {
    const tiles = unitTiles(demo);
    expect(tiles.reduce((s, t) => s + t.owned, 0)).toBe(demo.rules.length);
    for (const t of tiles.filter((x) => x.tone !== "group")) expect(t.tone === "none").toBe(t.owned === 0);
  });

  it("lays out a 500-person company: all units, nested, nothing overlapping at the same level", () => {
    const tiles = unitTiles(big);
    expect(tiles).toHaveLength(big.units.length);
    expect(tiles.some((t) => t.depth === 1)).toBe(true);
    const top = tiles.filter((t) => t.depth === 0);
    for (let i = 0; i < top.length; i++) for (let j = i + 1; j < top.length; j++) expect(overlap(top[i].rect, top[j].rect)).toBeLessThan(1e-6);
  });

  it("keeps a unit with no people on the canvas, as a sliver", () => {
    const k: Knowledge = { ...NO_KNOWLEDGE, units: [
      { id: "a", key: "A", name: "A", kind: "dept", headcount: 100, parentId: null, sort: 0 },
      { id: "b", key: "B", name: "B", kind: "dept", headcount: 0, parentId: null, sort: 1 },
    ] };
    expect(unitTiles(k).map((t) => t.key).sort()).toEqual(["A", "B"]);
  });

  it("says less in a small tile, and nothing in a tiny one", () => {
    const labels = new Set(unitTiles(big).map((t) => t.label));
    expect(labels.has("none") || labels.has("short")).toBe(true);
    for (const t of unitTiles(big)) {
      if (t.label === "full") expect(t.rect.w).toBeGreaterThanOrEqual(22);
      if (t.label === "none") expect(t.rect.w < 10 || t.rect.h < 6).toBe(true);
    }
  });

  it("still draws units in a parent loop, and a unit that is its own parent", () => {
    const k: Knowledge = { ...NO_KNOWLEDGE, units: [
      { id: "a", key: "A", name: "A", kind: "dept", headcount: 10, parentId: "b", sort: 0 },
      { id: "b", key: "B", name: "B", kind: "dept", headcount: 10, parentId: "a", sort: 1 },
      { id: "c", key: "C", name: "C", kind: "dept", headcount: 10, parentId: "c", sort: 2 },
    ] };
    const tiles = unitTiles(k);
    expect(tiles.map((t) => t.key).sort()).toEqual(["A", "B", "C"]);
    expect(new Set(tiles.map((t) => t.id)).size).toBe(3);
  });

  it("is empty for a company with no units", () => {
    expect(unitTiles(NO_KNOWLEDGE)).toEqual([]);
  });
});

describe("orgStats", () => {
  it("counts roles and people, and finds vacancies", () => {
    const s = orgStats(big);
    expect(s.units).toBe(big.units.length);
    expect(s.roles).toBe(big.roles.length);
    expect(s.people).toBeGreaterThan(400);
    expect(s.vacant).toBeGreaterThan(0);
    expect(s.span).toBeGreaterThan(1);
    expect(s.depth).toBeGreaterThanOrEqual(4);
  });

  it("is all zeros for nothing", () => {
    expect(orgStats(NO_KNOWLEDGE)).toEqual({ units: 0, people: 0, roles: 0, vacant: 0, managers: 0, span: 0, depth: 0, deadEnds: 0 });
  });
});

describe("roleForest", () => {
  it("never carries a holder's name", () => {
    expect(JSON.stringify(roleForest(big))).not.toMatch(/Person \d/);
    expect(JSON.stringify(roleForest(demo))).not.toContain(demo.holders[0].name);
  });

  it("draws the demo company's roles once each", () => {
    const f = roleForest(demo);
    expect(f.roots.reduce((s, b) => s + count(b), 0)).toBe(f.shown);
    expect(f.total).toBe(demo.roles.filter((r) => r.title).length);
  });

  it("caps a very large company to what fits, and says how much is cut", () => {
    const f = roleForest(largeOrg(3000));
    expect(f.total).toBeGreaterThan(MAX_ROLES);
    expect(f.shown).toBeLessThanOrEqual(MAX_ROLES);
    expect(f.roots.reduce((s, b) => s + count(b), 0)).toBe(f.shown);
    const walk = (b: RoleBranch) => { expect(b.children.length).toBeLessThanOrEqual(MAX_CHILDREN); b.children.forEach(walk); };
    f.roots.forEach(walk);
  });

  it("drops the small end of a wide level, and reports it", () => {
    const wide: Knowledge = { ...NO_KNOWLEDGE,
      units: [{ id: "u", key: "U", name: "U", kind: "dept", headcount: 80, parentId: null, sort: 0 }],
      roles: [
        { id: "boss", orgUnitId: "u", title: "Boss", reportsToId: null, decides: [], spendLimitEur: null, skills: [], sort: 0 },
        ...Array.from({ length: MAX_CHILDREN + 6 }, (_, i) => ({ id: "r" + i, orgUnitId: "u", title: "R" + i, reportsToId: "boss", decides: [], spendLimitEur: null, skills: [], sort: i + 1 })),
      ],
    };
    const [boss] = roleForest(wide).roots;
    expect(boss.children).toHaveLength(MAX_CHILDREN);
    expect(boss.hidden).toBe(6);
    expect(boss.reports).toBe(MAX_CHILDREN + 6);
    expect(boss.total).toBe(MAX_CHILDREN + 7);
  });

  it("filters to one unit, and a role whose boss is elsewhere becomes a top", () => {
    const team = big.units.find((u) => u.kind === "team")!;
    const f = roleForest(big, team.key);
    expect(f.total).toBe(big.roles.filter((r) => r.orgUnitId === team.id).length);
    expect(f.roots.length).toBeGreaterThan(0);
    const walk = (b: RoleBranch) => { expect(b.unitKey).toBe(team.key); b.children.forEach(walk); };
    f.roots.forEach(walk);
  });

  it("shows a 500-person company whole, with its size in the stats", () => {
    const f = roleForest(big);
    expect(f.total).toBeGreaterThan(100);
    expect(f.shown).toBe(f.total);
  });

  it("does not lose roles in a reporting loop, nor draw one twice", () => {
    const k: Knowledge = { ...NO_KNOWLEDGE,
      units: [{ id: "u", key: "U", name: "U", kind: "dept", headcount: 2, parentId: null, sort: 0 }],
      roles: [
        { id: "a", orgUnitId: "u", title: "A", reportsToId: "b", decides: [], spendLimitEur: null, skills: [], sort: 0 },
        { id: "b", orgUnitId: "u", title: "B", reportsToId: "a", decides: [], spendLimitEur: null, skills: [], sort: 1 },
      ],
    };
    const f = roleForest(k);
    expect(f.shown).toBe(2);
    expect(f.roots.reduce((s, b) => s + count(b), 0)).toBe(2);
  });

  it("marks a role nobody holds", () => {
    const flat = (bs: RoleBranch[]): RoleBranch[] => bs.flatMap((b) => [b, ...flat(b.children)]);
    expect(flat(roleForest(big).roots).some((b) => b.holders === 0)).toBe(true);
  });
});

describe("routingHealth", () => {
  it("has one cell per rule and counts that add up", () => {
    const h = routingHealth(big);
    expect(h.cells).toHaveLength(big.rules.length);
    expect(Object.values(h.counts).reduce((s, c) => s + c, 0)).toBe(big.rules.length);
  });

  it("finds the gaps the made-up company was built with, worst first", () => {
    const h = routingHealth(big, 100);
    expect(h.counts["no-deputy"] + h.counts["no-buddy"] + h.counts["no-owner"] + h.counts["vacant-owner"]).toBeGreaterThan(0);
    const order = ["no-owner", "vacant-owner", "no-deputy", "no-buddy"];
    const ranks = h.gaps.map((g) => order.indexOf(g.status));
    expect(ranks).toEqual([...ranks].sort((a, b) => a - b));
  });

  it("limits the list of gaps, not the grid", () => {
    const h = routingHealth(big, 2);
    expect(h.gaps.length).toBeLessThanOrEqual(2);
    expect(h.cells).toHaveLength(big.rules.length);
  });

  it("calls a fully staffed row complete", () => {
    expect(routingHealth(demo).cells.some((c) => c.status === "complete")).toBe(true);
  });

  it("reports an owner role that does not exist", () => {
    const k = { ...demo, rules: [{ ...demo.rules[0], ownerRoleId: "gone" }] };
    expect(routingHealth(k).cells[0].status).toBe("no-owner");
  });

  it("is empty for no rules", () => {
    expect(routingHealth(NO_KNOWLEDGE)).toEqual({ cells: [], counts: { complete: 0, "no-owner": 0, "vacant-owner": 0, "no-deputy": 0, "no-buddy": 0 }, gaps: [] });
  });
});
