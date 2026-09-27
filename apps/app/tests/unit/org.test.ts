import { describe, expect, it } from "vitest";
import { chainEdges, coworkersOf, layoutTree, pairs, projectsOf, visiblePeople } from "@/features/org";
import type { Initiative, OrgPerson } from "@/features/demo/types";

const PEOPLE: OrgPerson[] = [
  { name: "Boss", role: "MD", dept: "OPS", reportsTo: null },
  { name: "Lead A", role: "lead", dept: "PRD", reportsTo: "Boss" },
  { name: "Lead B", role: "lead", dept: "ENG", reportsTo: "Boss" },
  { name: "A1", role: "line", dept: "PRD", reportsTo: "Lead A" },
  { name: "A2", role: "line", dept: "PRD", reportsTo: "Lead A" },
];

const T = (id: string, names: string[]): Initiative =>
  ({ id, name: id, depts: [], people: names.length, status: "Building", stage: "", why: "", members: names.map((name) => ({ name, role: "" })) });

describe("layoutTree", () => {
  it("puts leaves in consecutive columns and parents over the middle of their children", () => {
    const t = layoutTree(PEOPLE);
    const at = (n: string) => t.nodes.find((x) => x.person.name === n)!;
    expect(at("A1").x).toBe(0);
    expect(at("A2").x).toBe(1);
    expect(at("Lead A").x).toBe(0.5);
    expect(at("Lead B").x).toBe(2);
    expect(at("Boss").x).toBe(1.25);
    expect(at("Boss").depth).toBe(0);
    expect(at("A2").depth).toBe(2);
    expect(t.cols).toBe(3);
    expect(t.rows).toBe(3);
    expect(t.edges).toHaveLength(4);
  });
  it("treats a person whose manager is unknown as a root", () => {
    const t = layoutTree([{ name: "X", role: "", dept: "OPS", reportsTo: "nobody" }]);
    expect(t.nodes[0].depth).toBe(0);
    expect(t.edges).toHaveLength(0);
  });
});

describe("projectsOf / coworkersOf / pairs", () => {
  const ts = [T("t1", ["A1", "Lead B", "Anonymous"]), T("t2", ["A1", "A2"]), T("t3", ["Lead A"])];
  it("lists the initiatives a person is on", () => {
    expect(projectsOf(ts, "A1").map((t) => t.id)).toEqual(["t1", "t2"]);
  });
  it("lists co-workers, most shared first, never anonymous", () => {
    expect(coworkersOf(ts, "A1").map((c) => c.name)).toEqual(["A2", "Lead B"]);
  });
  it("makes every pair once", () => {
    expect(pairs(["a", "b", "c"])).toEqual([["a", "b"], ["a", "c"], ["b", "c"]]);
  });
});

describe("chainEdges", () => {
  it("lights the reporting lines between the people and stops at their common ancestor", () => {
    expect([...chainEdges(PEOPLE, ["A1", "Lead B"])].sort()).toEqual(["Boss>Lead A", "Boss>Lead B", "Lead A>A1"]);
    expect([...chainEdges(PEOPLE, ["A1", "A2"])].sort()).toEqual(["Lead A>A1", "Lead A>A2"]);
  });
  it("needs two known people to draw anything", () => {
    expect(chainEdges(PEOPLE, ["A1"]).size).toBe(0);
    expect(chainEdges(PEOPLE, ["A1", "Anonymous"]).size).toBe(0);
  });
});

describe("visiblePeople", () => {
  it("hides everyone under a collapsed manager and counts them", () => {
    const v = visiblePeople(PEOPLE, new Set(["Lead A"]));
    expect(v.people.map((p) => p.name)).toEqual(["Boss", "Lead A", "Lead B"]);
    expect(v.folded.get("Lead A")).toBe(2);
  });
  it("keeps a selected person visible even under a collapsed manager", () => {
    const v = visiblePeople(PEOPLE, new Set(["Lead A"]), ["A2"]);
    expect(v.people.map((p) => p.name)).toContain("A2");
    expect(v.folded.size).toBe(0);
  });
});
