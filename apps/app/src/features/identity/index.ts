// Enterprise identity (phase EID): the names the sign-in, SCIM and export tasks share. Pure.

export type SsoProvider = "oidc" | "saml";

/** The systems that are one Integration row each (D7). */
export const IDENTITY_SYSTEMS = ["oidc", "saml", "scim", "logsink"] as const;
export type IdentitySystem = (typeof IDENTITY_SYSTEMS)[number];

/** Provider and issuer of the link SCIM makes (D6). */
export const SCIM_LINK_ISSUER = "scim";

/** Why an SSO sign-in was refused; each has a line in the `ssoLogin` messages. */
export const SSO_ERRORS = [
  "no_account",
  "several_accounts",
  "inactive",
  "not_on",
  "demo_company",
  "invalid_response",
  "replayed",
  "encrypted_assertion",
  "email_unverified",
  "expired_flow",
] as const;
export type SsoError = (typeof SSO_ERRORS)[number];
