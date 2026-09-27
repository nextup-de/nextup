// Does a Prisma argument object constrain the query to one company?
//
// Split out from client.ts on purpose: this half is pure, imports nothing, and is unit-tested in
// tests/unit/tenant-guard.test.ts without a database or a generated client - so `npm test` stays
// DB-free and CI needs no change.

/** Models whose rows belong to exactly one company. Anything else is unscoped by nature. */
export const TENANT_MODELS = new Set([
  "User",
  "CaseEvent",
  "ApiToken",
  "CompanyConfig",
  // Company knowledge - docs/COMPANY_KNOWLEDGE.md
  "CompanyProfile",
  "OrgUnit",
  "OrgRole",
  "OrgRoleHolder",
  "RoutingRule",
  "Goal",
  // Raise-page assistant - docs/ASSISTANT.md
  "Document",
  "AssistTurn",
]);

/** Operations that must narrow by company through `where`. */
export const NEEDS_WHERE = new Set([
  "findFirst",
  "findFirstOrThrow",
  "findMany",
  "findUnique",
  "findUniqueOrThrow",
  "count",
  "aggregate",
  "groupBy",
  "update",
  "updateMany",
  "delete",
  "deleteMany",
]);

/** Operations that must carry the company through the rows they write. */
export const NEEDS_DATA = new Set(["create", "createMany", "createManyAndReturn"]);

const isObject = (v: unknown): v is Record<string, unknown> => typeof v === "object" && v !== null;

/**
 * The one legitimate way to touch a tenant table without naming a company: a lookup by a column
 * that is globally unique, where the lookup is what DETERMINES the tenant.
 *
 * ApiToken.hash and User.loginCodeHash are the cases. A bearer token is the caller's whole identity - you cannot
 * scope the lookup by company, because which company it belongs to is exactly what you are
 * trying to find out. It is safe because the column is unique across the whole table, so the
 * query returns one row or none; the caller then compares that row's company to the one in the
 * URL and answers 403 if they differ (docs/INTEGRATIONS.md: "an event for company A sent with
 * company B's token is a 403, and that is a test").
 *
 * Every other ApiToken query - listing, revoking, marking used - stays scoped.
 *
 * A personal login code is the same thing for a person (src/features/auth/login-code.ts): the
 * login finds the User from the code alone, then compares that user's company to the one in the
 * URL and treats a mismatch as a wrong code.
 */
export const IDENTIFYING_LOOKUPS: Record<string, readonly string[]> = {
  ApiToken: ["hash"],
  User: ["loginCodeHash"],
};

/** Operations allowed to use an identifying lookup: reads of a single row, nothing else. */
const IDENTIFYING_OPERATIONS = new Set(["findUnique", "findUniqueOrThrow", "findFirst"]);

function isIdentifyingLookup(model: string, operation: string, where: unknown): boolean {
  const columns = IDENTIFYING_LOOKUPS[model];
  if (!columns || !IDENTIFYING_OPERATIONS.has(operation)) return false;
  if (!isObject(where)) return false;
  const keys = Object.keys(where);
  // Exactly the unique column and nothing else, so this cannot be widened into a general read.
  return keys.length === 1 && columns.includes(keys[0]) && where[keys[0]] !== undefined;
}

export class TenantScopeError extends Error {
  constructor(model: string, operation: string) {
    super(
      `${model}.${operation} ran without a companyId. Every query on a tenant table must name ` +
        `the company - go through src/lib/db/, never the raw client.`,
    );
    this.name = "TenantScopeError";
  }
}

/**
 * True when `where` pins the query to a company somewhere in its tree.
 *
 * Walks AND/OR/NOT and nested objects so that compound uniques
 * (`{ companyId_email: { companyId, email } }`) and grouped conditions both count.
 */
export function mentionsCompanyId(where: unknown): boolean {
  if (!isObject(where)) return false;
  if (where.companyId !== undefined && where.companyId !== null) return true;

  for (const value of Object.values(where)) {
    if (Array.isArray(value)) {
      if (value.some(mentionsCompanyId)) return true;
    } else if (isObject(value) && mentionsCompanyId(value)) {
      return true;
    }
  }
  return false;
}

/** True when every row being written names its company, by id or by relation. */
export function dataNamesCompany(data: unknown): boolean {
  const rows = Array.isArray(data) ? data : [data];
  if (rows.length === 0) return false;
  return rows.every(
    (row) => isObject(row) && (row.companyId !== undefined || row.company !== undefined),
  );
}

/**
 * The guard, expressed without Prisma types so it can be tested directly.
 * Returns null when the call is allowed, or the reason it is not.
 */
export function scopeViolation(
  model: string | undefined,
  operation: string,
  args: unknown,
): TenantScopeError | null {
  if (!model || !TENANT_MODELS.has(model)) return null;

  const a = isObject(args) ? args : {};

  if (NEEDS_WHERE.has(operation) && !mentionsCompanyId(a.where)) {
    if (isIdentifyingLookup(model, operation, a.where)) return null;
    return new TenantScopeError(model, operation);
  }
  if (NEEDS_DATA.has(operation) && !dataNamesCompany(a.data)) {
    return new TenantScopeError(model, operation);
  }
  // upsert has to satisfy both halves: it either finds a row or writes one.
  if (operation === "upsert" && !(mentionsCompanyId(a.where) && dataNamesCompany(a.create))) {
    return new TenantScopeError(model, operation);
  }
  return null;
}
