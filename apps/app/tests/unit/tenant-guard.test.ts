// The tenant guard (src/lib/db/scope.ts). Pure - no database, no generated client - so this runs
// in CI with the rest of `npm test`.
//
// What it is protecting: one company's rows must never come back for another. docs/INTEGRATIONS.md
// calls the cross-tenant case "a 403, and that is a test"; this is the query-level half of it.
import { describe, expect, it } from "vitest";
import { dataNamesCompany, mentionsCompanyId, scopeViolation } from "@/lib/db/scope";

describe("mentionsCompanyId", () => {
  it("accepts a direct companyId", () => {
    expect(mentionsCompanyId({ companyId: "c1" })).toBe(true);
  });

  it("accepts a compound unique", () => {
    expect(mentionsCompanyId({ companyId_email: { companyId: "c1", email: "a@b.c" } })).toBe(true);
  });

  it("walks AND / OR / NOT", () => {
    expect(mentionsCompanyId({ AND: [{ type: "case.raised" }, { companyId: "c1" }] })).toBe(true);
    expect(mentionsCompanyId({ OR: [{ companyId: "c1" }] })).toBe(true);
    expect(mentionsCompanyId({ NOT: { companyId: "c1" } })).toBe(true);
  });

  it("rejects anything that does not name a company", () => {
    expect(mentionsCompanyId({})).toBe(false);
    expect(mentionsCompanyId(undefined)).toBe(false);
    expect(mentionsCompanyId(null)).toBe(false);
    expect(mentionsCompanyId({ id: "e1" })).toBe(false);
    expect(mentionsCompanyId({ AND: [{ type: "case.raised" }] })).toBe(false);
  });

  it("does not accept a companyId that is present but empty", () => {
    // `{ companyId: undefined }` is what a forgotten variable looks like - it must not pass.
    expect(mentionsCompanyId({ companyId: undefined })).toBe(false);
    expect(mentionsCompanyId({ companyId: null })).toBe(false);
  });
});

describe("dataNamesCompany", () => {
  it("accepts an id or a relation", () => {
    expect(dataNamesCompany({ companyId: "c1" })).toBe(true);
    expect(dataNamesCompany({ company: { connect: { id: "c1" } } })).toBe(true);
  });

  it("requires every row of a createMany to name one", () => {
    expect(dataNamesCompany([{ companyId: "c1" }, { companyId: "c2" }])).toBe(true);
    expect(dataNamesCompany([{ companyId: "c1" }, { actor: "T. Vogel" }])).toBe(false);
  });

  it("rejects nothing at all", () => {
    expect(dataNamesCompany({})).toBe(false);
    expect(dataNamesCompany([])).toBe(false);
  });
});

describe("scopeViolation", () => {
  it("lets Company through - it is the tenant, not a tenant-scoped row", () => {
    expect(scopeViolation("Company", "findMany", {})).toBeNull();
    expect(scopeViolation("Company", "findUnique", { where: { slug: "acme" } })).toBeNull();
  });

  it("blocks an unscoped read of a tenant table", () => {
    expect(scopeViolation("CaseEvent", "findMany", {})).toBeInstanceOf(Error);
    expect(scopeViolation("User", "findFirst", { where: { email: "a@b.c" } })).toBeInstanceOf(Error);
    expect(scopeViolation("ApiToken", "count", { where: {} })).toBeInstanceOf(Error);
  });

  it("allows a scoped read", () => {
    expect(scopeViolation("CaseEvent", "findMany", { where: { companyId: "c1" } })).toBeNull();
    expect(
      scopeViolation("User", "findFirst", { where: { companyId: "c1", email: "a@b.c" } }),
    ).toBeNull();
  });

  it("blocks an unscoped delete - the one that would wipe every company", () => {
    expect(scopeViolation("CaseEvent", "deleteMany", {})).toBeInstanceOf(Error);
    expect(scopeViolation("CaseEvent", "deleteMany", { where: { companyId: "c1" } })).toBeNull();
  });

  it("blocks a write that does not say which company the row belongs to", () => {
    expect(scopeViolation("CaseEvent", "create", { data: { id: "e1" } })).toBeInstanceOf(Error);
    expect(scopeViolation("CaseEvent", "create", { data: { id: "e1", companyId: "c1" } })).toBeNull();
  });

  it("requires upsert to satisfy both halves", () => {
    expect(
      scopeViolation("CompanyConfig", "upsert", { where: { companyId: "c1" }, create: {} }),
    ).toBeInstanceOf(Error);
    expect(
      scopeViolation("CompanyConfig", "upsert", {
        where: { companyId: "c1" },
        create: { companyId: "c1" },
      }),
    ).toBeNull();
  });

  it("names the model and operation so the failure is findable", () => {
    const err = scopeViolation("CaseEvent", "findMany", {});
    expect(err?.message).toContain("CaseEvent.findMany");
  });
});

describe("the identifying-lookup exception", () => {
  it("lets a token be found by its globally unique hash", () => {
    // A bearer token is the caller's whole identity: you cannot scope this by company, because
    // which company it belongs to is what the lookup is for.
    expect(scopeViolation("ApiToken", "findUnique", { where: { hash: "abc" } })).toBeNull();
  });

  it("lets a person be found by their globally unique login-code hash", () => {
    expect(scopeViolation("User", "findUnique", { where: { loginCodeHash: "abc" } })).toBeNull();
    expect(scopeViolation("User", "findMany", { where: { loginCodeHash: "abc" } })).toBeInstanceOf(Error);
    expect(scopeViolation("User", "update", { where: { loginCodeHash: "abc" } })).toBeInstanceOf(Error);
    expect(scopeViolation("User", "findUnique", { where: { loginCodeHash: "abc", role: "manager" } })).toBeInstanceOf(Error);
  });

  it("does not widen into a general read of the table", () => {
    // Only the unique column, on its own, on a single-row read.
    expect(scopeViolation("ApiToken", "findMany", { where: { hash: "abc" } })).toBeInstanceOf(Error);
    expect(scopeViolation("ApiToken", "findUnique", { where: { hash: "abc", name: "n8n" } })).toBeInstanceOf(Error);
    expect(scopeViolation("ApiToken", "findFirst", { where: { name: "n8n" } })).toBeInstanceOf(Error);
    expect(scopeViolation("ApiToken", "deleteMany", { where: { hash: "abc" } })).toBeInstanceOf(Error);
    expect(scopeViolation("ApiToken", "update", { where: { hash: "abc" } })).toBeInstanceOf(Error);
  });

  it("is not available to other tenant tables", () => {
    expect(scopeViolation("User", "findUnique", { where: { hash: "abc" } })).toBeInstanceOf(Error);
    expect(scopeViolation("CaseEvent", "findUnique", { where: { id: "e1" } })).toBeInstanceOf(Error);
  });

  it("still requires the value to be present", () => {
    expect(scopeViolation("ApiToken", "findUnique", { where: { hash: undefined } })).toBeInstanceOf(Error);
  });
});

describe("the admin automation read", () => {
  // /admin is cross-company by nature, but "every company" is the caller's intention, not a
  // property of the query: it passes the ids it already listed, and `in` still names them.
  it("allows a groupBy pinned to a list of companies", () => {
    expect(
      scopeViolation("CaseEvent", "groupBy", {
        by: ["companyId"],
        where: { companyId: { in: ["c1", "c2"] }, source: "n8n" },
      }),
    ).toBeNull();
    expect(
      scopeViolation("ApiToken", "findMany", { where: { companyId: { in: ["c1"] }, name: "n8n" } }),
    ).toBeNull();
  });

  it("still refuses the same read with no company at all", () => {
    expect(
      scopeViolation("CaseEvent", "groupBy", { by: ["companyId"], where: { source: "n8n" } }),
    ).toBeInstanceOf(Error);
  });
});
