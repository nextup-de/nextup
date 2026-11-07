// The console's long lists: finding a row, one page of them, and who a bulk action reaches.
import { describe, expect, it } from "vitest";
import { actionTargets, matchesSearch, pageOf, peopleGroups, searchPeople, someNames } from "@/features/admin/list";
import type { PersonRow } from "@/features/admin/rows";

const person = (name: string, over: Partial<PersonRow> = {}): PersonRow => ({
  id: name, name, email: `${name.toLowerCase().replace(/\W/g, ".")}@x.test`, role: "employee", codeIssuedAt: null, microsoft: false, active: true, isStackAdmin: false, hasTotp: false, ...over,
});
const ids = (people: readonly PersonRow[]) => people.map((p) => p.id);

describe("matchesSearch", () => {
  it("ignores case and accents and takes the words in any order", () => {
    expect(matchesSearch("Jürgen Müller", "muller JURGEN")).toBe(true);
    expect(matchesSearch("Jürgen Müller", "müller anna")).toBe(false);
  });
  it("matches everything when nothing is typed", () => {
    expect(matchesSearch("anything", "  ")).toBe(true);
  });
});

describe("pageOf", () => {
  const rows = Array.from({ length: 25 }, (_, i) => i);
  it("cuts the list and says where it is", () => {
    expect(pageOf(rows, 1, 10)).toEqual({ rows: rows.slice(10, 20), page: 1, pages: 3, from: 11, to: 20, total: 25 });
  });
  it("answers the last page when the list shrank under the current page", () => {
    const view = pageOf(rows.slice(0, 12), 5, 10);
    expect(view.page).toBe(1);
    expect(view.rows).toEqual([10, 11]);
  });
  it("has one empty page for an empty list", () => {
    expect(pageOf([], 0, 10)).toEqual({ rows: [], page: 0, pages: 1, from: 0, to: 0, total: 0 });
  });
});

describe("searchPeople", () => {
  const people = [person("Anna Weber"), person("Ben Stark", { role: "manager" }), person("Cem Yilmaz", { email: "cem@plant.test" })];
  it("finds a person by name, email or role", () => {
    expect(ids(searchPeople(people, "weber"))).toEqual(["Anna Weber"]);
    expect(ids(searchPeople(people, "manager"))).toEqual(["Ben Stark"]);
    expect(ids(searchPeople(people, "plant"))).toEqual(["Cem Yilmaz"]);
  });
});

describe("actionTargets", () => {
  it("reaches only the people an action changes", () => {
    const admin = person("Admin", { isStackAdmin: true, hasTotp: true });
    const plain = person("Plain");
    const gone = person("Gone", { active: false, isStackAdmin: true, hasTotp: true });
    const t = actionTargets([admin, plain, gone]);
    expect(ids(t.code)).toEqual(["Admin", "Plain", "Gone"]);
    expect(ids(t.grant)).toEqual(["Plain"]);
    expect(ids(t.revoke)).toEqual(["Admin"]);
    expect(ids(t.reset)).toEqual(["Admin"]);
  });
});

describe("peopleGroups", () => {
  it("names who cannot sign in and who can open the console", () => {
    const persons = [person("Locked"), person("Coded", { codeIssuedAt: "2026-09-01" }), person("Admin", { codeIssuedAt: "2026-09-01", isStackAdmin: true }), person("Gone", { codeIssuedAt: "2026-09-01", active: false, isStackAdmin: true })];
    const g = peopleGroups({ persons, entraTenantId: null });
    expect(ids(g.locked)).toEqual(["Locked"]);
    expect(ids(g.admins)).toEqual(["Admin"]);
  });
});

describe("someNames", () => {
  it("keeps the first few and counts the rest", () => {
    expect(someNames(["a", "b", "c", "d", "e"], 3)).toEqual({ names: ["a", "b", "c"], more: 2 });
    expect(someNames(["a"], 3)).toEqual({ names: ["a"], more: 0 });
  });
});
