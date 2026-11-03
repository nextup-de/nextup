// External identities and single-use sign-in keys (phase EID, D6). An identity is found by provider,
// issuer and subject inside one company, so one company's link never matches another's. The keys
// (SsoReplay) are a SAML assertion id or OIDC state seen once, or a request id kept until its response.
import { getDb, type Db } from "@/lib/db/client";
import type { Tx } from "@/lib/db/integrations";

type Client = Db | Tx;

export type IdentityInfo = {
  id: string;
  companyId: string;
  userId: string;
  provider: string;
  issuer: string;
  subject: string;
  createdAt: Date;
  lastSeenAt: Date | null;
};

export type IdentityInput = { companyId: string; userId: string; provider: string; issuer: string; subject: string };

/** The link for this account at this identity provider, or null. Scoped by company. */
export async function findIdentity(companyId: string, provider: string, issuer: string, subject: string): Promise<IdentityInfo | null> {
  return getDb().externalIdentity.findUnique({
    where: { companyId_provider_issuer_subject: { companyId, provider, issuer, subject } },
  });
}

/** Links a person to an account at an identity provider. Throws when the account is already linked (unique key). */
export async function linkIdentity(input: IdentityInput, client: Client = getDb()): Promise<IdentityInfo> {
  return client.externalIdentity.create({
    data: {
      companyId: input.companyId, userId: input.userId, provider: input.provider, issuer: input.issuer, subject: input.subject,
    },
  });
}

/** Records that the link was just used to sign in. */
export async function touchIdentity(id: string): Promise<void> {
  await getDb().externalIdentity.update({ where: { id }, data: { lastSeenAt: new Date() } });
}

/** Every link a person has. */
export async function identitiesOf(userId: string): Promise<IdentityInfo[]> {
  return getDb().externalIdentity.findMany({ where: { userId }, orderBy: { createdAt: "asc" } });
}

/**
 * Accepts a replay key once: inserts it and returns true. Returns false while the key exists and has not
 * expired; an expired key is accepted again. Expired rows of that company are deleted first.
 */
export async function useOnce(key: string, companyId: string, expiresAt: Date): Promise<boolean> {
  const db = getDb();
  const now = new Date();
  await db.ssoReplay.deleteMany({ where: { companyId, expiresAt: { lte: now } } });
  const made = await db.ssoReplay.createMany({ data: [{ key, companyId, expiresAt }], skipDuplicates: true });
  return made.count === 1;
}

/** Stores a request id to be taken once by `takeOnce`; storing it again replaces its expiry. */
export async function saveOnce(key: string, companyId: string, expiresAt: Date): Promise<void> {
  await getDb().ssoReplay.upsert({ where: { key }, create: { key, companyId, expiresAt }, update: { companyId, expiresAt } });
}

/** True exactly once for a stored key that has not expired; the key is gone afterwards. */
export async function takeOnce(key: string): Promise<boolean> {
  const taken = await getDb().ssoReplay.deleteMany({ where: { key, expiresAt: { gt: new Date() } } });
  return taken.count === 1;
}
