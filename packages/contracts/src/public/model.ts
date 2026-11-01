// The canonical model: people, org, roles, cases, decisions, projects. No per-person count, score or rank (D6); display names are never keys (D9).
// Part of @nextup/contracts/public (PILOT public contracts). Changes only by D3: add an optional field, a new
// export or an optional interface member; anything else is a new version next to the old one.
import { z } from "zod";
import { ExternalIds, IsoDateTime, Locale, PublicId, Url } from "./primitives";

/** Someone who can sign in (Prisma `User`). `displayName` is for display only. */
export const Person = z.object({
  id: PublicId,
  companyId: PublicId,
  displayName: z.string().min(1).max(120),
  email: z.string().email().nullable(),
  locale: Locale.nullable(),
  active: z.boolean(),
  managerId: PublicId.nullable(),
  orgUnitIds: z.array(PublicId),
  externalIds: ExternalIds,
});
export type Person = z.infer<typeof Person>;

export const OrgUnit = z.object({
  id: PublicId,
  companyId: PublicId,
  key: z.string().min(1).max(32),
  name: z.string().min(1).max(120),
  kind: z.enum(["board", "dept", "team", "site"]),
  parentId: PublicId.nullable(),
  externalIds: ExternalIds,
});
export type OrgUnit = z.infer<typeof OrgUnit>;

export const Role = z.object({
  id: PublicId,
  companyId: PublicId,
  key: z.string().min(1).max(64),
  title: z.string().min(1).max(120),
  orgUnitId: PublicId.nullable(),
  reportsToRoleId: PublicId.nullable(),
});
export type Role = z.infer<typeof Role>;

/** Who sits in a role. `userId` null = a person in the org chart who cannot sign in. `label` is display only. */
export const RoleHolder = z.object({
  id: PublicId,
  companyId: PublicId,
  roleId: PublicId,
  userId: PublicId.nullable(),
  label: z.string().min(1).max(120),
  kind: z.enum(["holder", "deputy"]),
  validFrom: IsoDateTime.nullable(),
  validTo: IsoDateTime.nullable(),
});
export type RoleHolder = z.infer<typeof RoleHolder>;

export const CaseRef = z.object({
  id: PublicId,
  companyId: PublicId,
  kind: z.enum(["problem", "idea"]),
  title: z.string().min(1).max(200),
  state: z.enum(["open", "decided", "closed"]),
  ownerRoleId: PublicId.nullable(),
  routeKey: z.string().min(1).max(64).nullable(),
  raisedAt: IsoDateTime,
  url: Url.nullable(),
});
export type CaseRef = z.infer<typeof CaseRef>;

export const Decision = z.object({
  id: PublicId,
  companyId: PublicId,
  caseId: PublicId,
  answer: z.enum(["yes", "no"]),
  reason: z.string().max(2000).nullable(),
  decidedAt: IsoDateTime,
  decidedByRoleId: PublicId.nullable(),
  decidedByUserId: PublicId.nullable(),
  projectId: PublicId.nullable(),
});
export type Decision = z.infer<typeof Decision>;

export const ProjectRef = z.object({
  id: PublicId,
  companyId: PublicId,
  caseId: PublicId.nullable(),
  title: z.string().min(1).max(200),
  state: z.enum(["planned", "running", "done", "stopped"]),
  leadRoleId: PublicId.nullable(),
  links: z.array(z.object({ system: z.string().min(1).max(32), key: z.string().min(1).max(64).nullable(), url: Url })),
});
export type ProjectRef = z.infer<typeof ProjectRef>;
