// Company knowledge rows <-> Seed. The load-bearing claim: a company moved from seedJson to the
// tables renders exactly as before, because the rows project back to the same depts, people and
// routes - and reduce() over them gives the same cases.
import { describe, expect, it } from "vitest";
import { SEED } from "@/features/demo/seed";
import { GOALS } from "@/features/evaluate";
import { emptyLog } from "@/features/cases/events";
import { reduce } from "@/features/cases/reducer";
import { companyBrief, NO_KNOWLEDGE, overlayKnowledge, roleTree, rowsFromSeed, seedParts } from "@/features/knowledge";

const counter = () => { let n = 0; return () => "id" + ++n; };
const rows = () => rowsFromSeed(SEED, GOALS, counter());

describe("rowsFromSeed -> seedParts", () => {
  it("gives back the seed's depts, people and routes unchanged", () => {
    const back = seedParts(rows());
    expect(back.depts).toEqual(SEED.depts);
    expect(back.people).toEqual(SEED.people);
    expect(back.routes).toEqual(SEED.routes);
  });

  it("reduces to the same cases as the seed", () => {
    const moved = overlayKnowledge({ ...SEED, depts: [], people: [], routes: [] }, rows());
    expect(reduce(moved, emptyLog()).cases).toEqual(reduce(SEED, emptyLog()).cases);
  });
});

describe("the structure is between roles, not people", () => {
  it("makes one role for two people with the same title, unit and boss", () => {
    const k = rows();
    const line3 = k.roles.filter((r) => r.title === "Line 3");
    expect(line3).toHaveLength(1);
    expect(k.holders.filter((h) => h.roleId === line3[0].id).map((h) => h.name)).toEqual(["S. Dahl", "J. Schmidt"]);
    expect(k.roles.length).toBe(SEED.people.length - 1);
  });

  it("links roles, not names, in the hierarchy and the routing table", () => {
    const k = rows();
    const roleIds = new Set(k.roles.map((r) => r.id));
    for (const r of k.roles) if (r.reportsToId) expect(roleIds.has(r.reportsToId)).toBe(true);
    for (const rule of k.rules) {
      expect(roleIds.has(rule.ownerRoleId)).toBe(true);
      if (rule.deputyRoleId) expect(roleIds.has(rule.deputyRoleId)).toBe(true);
      if (rule.buddyRoleId) expect(roleIds.has(rule.buddyRoleId)).toBe(true);
    }
  });

  it("keeps the evaluate goals as goal rows", () => {
    expect(rows().goals.map((g) => g.title)).toEqual(GOALS.map((g) => g.goal));
  });
});

describe("roleTree and companyBrief", () => {
  it("lists every role once, each boss before the roles under it", () => {
    const k = rows();
    const tree = roleTree(k);
    expect(tree).toHaveLength(k.roles.length);
    const at = new Map(tree.map((n, i) => [n.role.id, i]));
    for (const n of tree) if (n.role.reportsToId) expect(at.get(n.role.reportsToId)!).toBeLessThan(at.get(n.role.id)!);
    expect(tree[0]).toMatchObject({ depth: 0, holders: ["E. Lindqvist"] });
  });

  it("gives the model roles, routes and goals - and not one name", () => {
    const brief = companyBrief(rows(), { vision: "Machines that never wait", mission: "", principles: [], businessModel: "" });
    expect(brief).toContain("Vision: Machines that never wait");
    expect(brief).toContain("[r1] Spend under €5k");
    expect(brief).toContain("Team lead, 4-series (Production)");
    expect(brief).toContain(GOALS[0].goal);
    for (const p of SEED.people) expect(brief).not.toContain(p.name);
  });

  it("is deterministic, so it can be cached and hashed", () => {
    expect(companyBrief(rows(), null)).toBe(companyBrief(rows(), null));
  });
});

describe("overlayKnowledge", () => {
  it("leaves a company without rows exactly as its seedJson", () => {
    expect(overlayKnowledge(SEED, NO_KNOWLEDGE)).toBe(SEED);
  });

  it("gives a name the org chart lacks a role of its own, outside the org chart", () => {
    const seed = { ...SEED, routes: [{ ...SEED.routes[0], deputy: "Z. Nobody" }] };
    const k = rowsFromSeed(seed, [], counter());
    expect(k.holders.some((h) => h.name === "Z. Nobody")).toBe(true);
    const back = seedParts(k);
    expect(back.routes[0].deputy).toBe("Z. Nobody");
    expect(back.people.some((p) => p.name === "Z. Nobody")).toBe(false);
  });
});
