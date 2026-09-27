// The rules for adding a company. Pure - no database.
import { describe, expect, it } from "vitest";
import {
  initialsOf,
  markFor,
  normaliseSlug,
  seedNameWarnings,
  validateNewCompany,
  type NewCompany,
} from "@/features/tenant/create";
import { SEED } from "@/features/demo/seed";

const base: NewCompany = {
  slug: "globex",
  name: "Globex AG",
  template: "demo",
  people: [{ name: "P. Meier", email: "p.meier@globex.test", role: "manager" }],
};
const fieldsOf = (c: NewCompany) => validateNewCompany(c).map((p) => p.field);

describe("validateNewCompany", () => {
  it("accepts a reasonable company", () => {
    expect(validateNewCompany(base)).toEqual([]);
  });

  it("refuses a slug that would collide with the app's own routes", () => {
    // These are the hosts and paths the proxy reserves - a company here would shadow them.
    for (const slug of ["admin", "www", "api", "n8n", "login", "pricing"]) {
      expect(fieldsOf({ ...base, slug })).toContain("slug");
    }
  });

  it("refuses a slug that is not a usable subdomain label", () => {
    for (const slug of ["", "a", "-x", "x-", "Globex", "glo bex", "glo.bex", "x".repeat(33)]) {
      expect(fieldsOf({ ...base, slug })).toContain("slug");
    }
  });

  it("requires a name", () => {
    expect(fieldsOf({ ...base, name: "   " })).toContain("name");
  });

  it("requires somebody who can log in, and a manager among them", () => {
    expect(fieldsOf({ ...base, people: [] })).toContain("people");
    expect(
      fieldsOf({ ...base, people: [{ name: "A", email: "a@b.co", role: "member" }] }),
    ).toContain("people");
  });

  it("catches a bad or duplicated address", () => {
    expect(fieldsOf({ ...base, people: [{ ...base.people[0], email: "not-an-email" }] })).toContain("people");
    expect(
      fieldsOf({
        ...base,
        people: [base.people[0], { name: "Other", email: "P.Meier@globex.test", role: "member" }],
      }),
    ).toContain("people");
  });

  it("reports everything at once rather than one thing at a time", () => {
    const problems = validateNewCompany({ ...base, slug: "admin", name: "", people: [] });
    expect(problems.length).toBeGreaterThanOrEqual(3);
  });
});

describe("seedNameWarnings", () => {
  it("warns when a person's name is not in the seed", () => {
    // derive.ts matches people to cases by NAME, so this renders an empty inbox with no error.
    const warnings = seedNameWarnings(SEED, [{ name: "Nobody Here", email: "n@x.co", role: "leader" }]);
    expect(warnings).toHaveLength(1);
    expect(warnings[0]).toContain("Nobody Here");
  });

  it("stays quiet for a name the seed knows", () => {
    const known = SEED.routes[0].owner.name;
    expect(seedNameWarnings(SEED, [{ name: known, email: "k@x.co", role: "leader" }])).toEqual([]);
  });

  it("stays quiet for an empty template, where there is nothing to match", () => {
    const empty = { ...SEED, personas: [], routes: [], people: [], buddies: [] };
    expect(seedNameWarnings(empty, [{ name: "Anyone", email: "a@x.co", role: "member" }])).toEqual([]);
  });
});

describe("small helpers", () => {
  it("makes initials and a mark", () => {
    expect(initialsOf("T. Vogel")).toBe("TV");
    expect(initialsOf("Bosch")).toBe("B");
    expect(markFor({ name: "Globex AG" })).toBe("G");
    expect(markFor({ name: "Globex AG", mark: "x" })).toBe("X");
  });

  it("normalises whatever was typed into a usable slug", () => {
    expect(normaliseSlug("  Bosch Rexroth  ")).toBe("bosch-rexroth");
    expect(normaliseSlug("ACME!!")).toBe("acme");
    expect(normaliseSlug("--a--b--")).toBe("a-b");
  });
});
