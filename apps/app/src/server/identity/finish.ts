// The finisher every SSO sign-in shares (EID D4): claims in, a session and a redirect out.
// Not a "use server" module: a helper the OIDC (and later SAML) route glue calls.
//
// Person lookup: the ExternalIdentity link first; only when there is none, exactly one active user of
// the company whose email equals the claimed one and who has no link of this provider yet - and then the
// link is written. Display names are never compared. Never creates an account, never changes a role.
import type { IdentityClaims } from "@nextup/contracts/public";
import { holdsRealPeople } from "@/features/admin/stages";
import { getDb } from "@/lib/db/client";
import { getIntegration, saveIntegration } from "@/lib/db/integrations";
import { findIdentity, linkIdentity, touchIdentity } from "@/lib/db/sso";
import { companyPrefix } from "@/features/tenant/urls";
import { issueSession } from "@/server/issue-session";
import { safeNext } from "@/server/microsoft-login";
import { entryFor, homeOf } from "@/server/setup-open";

export const SSO_ERRORS = [
  "demo_company", "not_on", "state", "expired", "invalid_response", "email_unverified",
  "no_email", "unknown_user", "ambiguous", "inactive", "closed", "failed",
] as const;
export type SsoErrorCode = (typeof SSO_ERRORS)[number];

/** A refused sign-in. `test` says the flow was an admin's test, so the result is stored, not shown on the login page. */
export class SsoError extends Error {
  constructor(readonly code: SsoErrorCode, readonly test = false) {
    super(code);
    this.name = "SsoError";
  }
}

export type SsoProvider = "oidc" | "saml";

export const loginErrorUrl = (slug: string, code: SsoErrorCode) => `${companyPrefix(slug)}/login?sso_error=${code}`;
export const testedUrl = (slug: string, provider: SsoProvider) => `${companyPrefix(slug)}/settings/sign-in?tested=${provider}`;

type Found = { id: string; name: string; handle: string | null; role: string; active: boolean; isStackAdmin: boolean };

/** Remembers the last test on the provider's card. `detail` is a user id or an error code, never a token. */
async function storeTest(companyId: string, provider: SsoProvider, ok: boolean, detail: string): Promise<void> {
  const row = await getIntegration(companyId, provider);
  if (!row) return;
  const account = typeof row.account === "object" && row.account !== null ? (row.account as Record<string, unknown>) : {};
  await saveIntegration({
    companyId, system: provider, settings: row.settings, updatedBy: row.updatedBy,
    account: { ...account, lastTest: { at: new Date().toISOString(), ok, detail } },
  });
}

/** Finds the person (link, else one-time email match). Throws SsoError. `link` false writes nothing. */
async function matchUser(companyId: string, provider: SsoProvider, claims: IdentityClaims, link: boolean): Promise<{ user: Found; identityId: string | null }> {
  const db = getDb();
  const select = { id: true, name: true, handle: true, role: true, active: true, isStackAdmin: true } as const;

  const known = await findIdentity(companyId, provider, claims.issuer, claims.subject);
  if (known) {
    const user = await db.user.findFirst({ where: { id: known.userId, companyId }, select });
    if (!user || !user.active) throw new SsoError("inactive");
    return { user, identityId: known.id };
  }

  if (!claims.email) throw new SsoError("no_email");
  const sameEmail = await db.user.findMany({
    where: { companyId, email: { equals: claims.email, mode: "insensitive" } },
    select: { ...select, externalIdentities: { where: { provider }, select: { id: true } } },
  });
  const open = sameEmail.filter((u) => u.active && u.externalIdentities.length === 0);
  if (open.length > 1) throw new SsoError("ambiguous");
  if (open.length === 0) throw new SsoError(sameEmail.some((u) => !u.active) ? "inactive" : "unknown_user");
  const user = open[0];
  if (!link) return { user, identityId: null };
  try {
    const made = await linkIdentity({ companyId, userId: user.id, provider, issuer: claims.issuer, subject: claims.subject });
    return { user, identityId: made.id };
  } catch {
    // The same account was linked in the meantime (unique key): not this person's to take.
    throw new SsoError("unknown_user");
  }
}

/** A test that failed before there were claims (bad state, provider error): store it, go back to the card. */
export async function storeFailedTest(companyId: string, slug: string, provider: SsoProvider, code: SsoErrorCode): Promise<string> {
  await storeTest(companyId, provider, false, code);
  return testedUrl(slug, provider);
}

export async function finishSsoLogin(p: {
  companyId: string;
  slug: string;
  provider: SsoProvider;
  claims: IdentityClaims;
  test: boolean;
  origin: string;
  /** The flow's `next`; goes through safeNext. */
  next?: string | null;
}): Promise<{ redirect: string }> {
  const { companyId, slug, provider, claims, test } = p;
  const fail = async (code: SsoErrorCode): Promise<{ redirect: string }> => {
    if (!test) return { redirect: loginErrorUrl(slug, code) };
    await storeTest(companyId, provider, false, code);
    return { redirect: testedUrl(slug, provider) };
  };

  const company = await getDb().company.findUnique({ where: { id: companyId }, select: { stage: true } });
  if (!company || !holdsRealPeople(company.stage)) return fail("demo_company");
  const row = await getIntegration(companyId, provider);
  if (!row || !row.on) return fail("not_on");

  let found: { user: Found; identityId: string | null };
  try {
    found = await matchUser(companyId, provider, claims, !test);
  } catch (err) {
    if (err instanceof SsoError) return fail(err.code);
    console.warn(`[sso] ${slug}: ${provider} sign-in failed`, err);
    return fail("failed");
  }

  if (test) {
    await storeTest(companyId, provider, true, `matched ${found.user.id}`);
    return { redirect: testedUrl(slug, provider) };
  }

  // Closed until opened: only setup people get a session (features/pilot/open.ts). A test above signs nobody in.
  const entry = await entryFor(companyId, found.user);
  if (entry === "refused") return fail("closed");
  if (found.identityId) await touchIdentity(found.identityId);
  await issueSession(companyId, slug, found.user);
  return { redirect: companyPrefix(slug) + (safeNext(p.next) || homeOf(entry, found.user.role)) };
}
