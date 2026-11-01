// IdentityProvider connector interface (sign-in).
// Part of @nextup/contracts/public (PILOT public contracts). Changes only by D3: add an optional field, a new
// export or an optional interface member; anything else is a new version next to the old one.
import { z } from "zod";
import { ExternalIds, Url } from "../primitives";
import type { Connector } from "./base";

export const LoginStart = z.object({
  redirectUrl: Url,
  state: z.string().min(16).max(200),
});
export type LoginStart = z.infer<typeof LoginStart>;

/** The query of an OIDC redirect or the form body of a SAML POST. */
export const LoginCallback = z.object({
  state: z.string().min(16).max(200),
  params: z.record(z.string(), z.string()),
});
export type LoginCallback = z.infer<typeof LoginCallback>;

export const IdentityClaims = z.object({
  issuer: z.string(),
  subject: z.string(),
  email: z.string().email().nullable(),
  displayName: z.string().min(1).max(120),
  tenantId: z.string().nullable(),
  groups: z.array(z.string()),
  appRoles: z.array(z.string()),
  department: z.string().nullable(),
  externalIds: ExternalIds,
});
export type IdentityClaims = z.infer<typeof IdentityClaims>;

export interface IdentityProvider extends Connector<"IdentityProvider"> {
  startLogin(input: { companyId: string; returnTo: string }): Promise<LoginStart>;
  completeLogin(input: LoginCallback): Promise<IdentityClaims>;
}
