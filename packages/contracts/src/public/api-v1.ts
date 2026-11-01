// API v1 request and response schemas and the endpoint table (the API phase generates OpenAPI from `ApiV1`).
// Part of @nextup/contracts/public (PILOT public contracts). Changes only by D3: add an optional field, a new
// export or an optional interface member; anything else is a new version next to the old one.
import { z } from "zod";
import { PublicId } from "./primitives";
import { CaseRef, Decision, OrgUnit, ProjectRef, Role, RoleHolder } from "./model";

export const API_V1_BASE = "/api/v1/[company]";

export const ApiV1Error = z.object({
  error: z.object({
    code: z.enum(["bad_request", "unauthorized", "forbidden", "not_found", "conflict", "rate_limited", "internal"]),
    message: z.string().max(500),
    requestId: z.string(),
  }),
});
export type ApiV1Error = z.infer<typeof ApiV1Error>;

export const ApiV1PageInfo = z.object({ nextCursor: z.string().nullable() });
export type ApiV1PageInfo = z.infer<typeof ApiV1PageInfo>;

export const ApiV1ListQuery = z.object({
  cursor: z.string().optional(),
  limit: z.coerce.number().int().min(1).max(200).default(50),
});
export type ApiV1ListQuery = z.infer<typeof ApiV1ListQuery>;

export const ApiV1CaseList = z.object({ data: z.array(CaseRef), page: ApiV1PageInfo });
export type ApiV1CaseList = z.infer<typeof ApiV1CaseList>;

export const ApiV1Case = z.object({ data: CaseRef });
export type ApiV1Case = z.infer<typeof ApiV1Case>;

/** `externalId` is the caller's idempotency key. */
export const ApiV1CaseCreate = z.object({
  title: z.string().min(1).max(200),
  body: z.string().min(1).max(8000),
  kind: z.enum(["problem", "idea"]),
  raisedByUserId: PublicId.nullable(),
  routeHint: z.string().nullable(),
  externalId: z.string().min(1).max(200).nullable(),
});
export type ApiV1CaseCreate = z.infer<typeof ApiV1CaseCreate>;

export const ApiV1CaseCreated = z.object({ data: CaseRef });
export type ApiV1CaseCreated = z.infer<typeof ApiV1CaseCreated>;

export const ApiV1DecisionList = z.object({ data: z.array(Decision), page: ApiV1PageInfo });
export type ApiV1DecisionList = z.infer<typeof ApiV1DecisionList>;

export const ApiV1ProjectList = z.object({ data: z.array(ProjectRef), page: ApiV1PageInfo });
export type ApiV1ProjectList = z.infer<typeof ApiV1ProjectList>;

export const ApiV1Project = z.object({ data: ProjectRef });
export type ApiV1Project = z.infer<typeof ApiV1Project>;

export const ApiV1Org = z.object({
  data: z.object({ units: z.array(OrgUnit), roles: z.array(Role), holders: z.array(RoleHolder) }),
});
export type ApiV1Org = z.infer<typeof ApiV1Org>;

export type ApiV1Endpoint = {
  id: string;
  method: "GET" | "POST";
  path: string;
  scope: string;
  query: z.ZodType | null;
  request: z.ZodType | null;
  response: z.ZodType;
};

export const ApiV1 = {
  version: 1,
  base: API_V1_BASE,
  endpoints: [
    { id: "cases.list", method: "GET", path: "/cases", scope: "cases:read", query: ApiV1ListQuery, request: null, response: ApiV1CaseList },
    { id: "cases.get", method: "GET", path: "/cases/{id}", scope: "cases:read", query: null, request: null, response: ApiV1Case },
    { id: "cases.create", method: "POST", path: "/cases", scope: "cases:write", query: null, request: ApiV1CaseCreate, response: ApiV1CaseCreated },
    { id: "decisions.list", method: "GET", path: "/decisions", scope: "decisions:read", query: ApiV1ListQuery, request: null, response: ApiV1DecisionList },
    { id: "projects.list", method: "GET", path: "/projects", scope: "projects:read", query: ApiV1ListQuery, request: null, response: ApiV1ProjectList },
    { id: "projects.get", method: "GET", path: "/projects/{id}", scope: "projects:read", query: null, request: null, response: ApiV1Project },
    { id: "org.get", method: "GET", path: "/org", scope: "org:read", query: null, request: null, response: ApiV1Org },
  ],
} as const satisfies { version: 1; base: string; endpoints: readonly ApiV1Endpoint[] };
