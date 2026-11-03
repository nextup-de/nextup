// API tokens for the integration endpoints. The raw token is shown once at creation and never
// stored - only sha256(raw), so a database dump does not hand anyone the keys.
import { createHash, randomBytes, timingSafeEqual } from "node:crypto";
import { getDb } from "./client";
import { recordAudit, type AuditActor } from "@/server/audit/record";

export const TOKEN_PREFIX = "nxt_";

export function hashToken(raw: string): string {
  return createHash("sha256").update(raw).digest("hex");
}

export function generateToken(): string {
  return TOKEN_PREFIX + randomBytes(24).toString("hex");
}

export type ResolvedToken = {
  id: string;
  companyId: string;
  companySlug: string;
  scopes: string[];
};

/**
 * Look a token up by its hash.
 *
 * Deliberately NOT scoped to the requested company: the caller compares
 * `token.companySlug` to the slug in the URL itself, so that a token belonging to another company
 * is a 403 ("this token is not for that company") rather than a 401 ("no such token"). That
 * distinction is what docs/INTEGRATIONS.md asks for, and it is a test.
 */
export async function resolveToken(raw: string): Promise<ResolvedToken | null> {
  const row = await getDb().apiToken.findUnique({
    where: { hash: hashToken(raw) },
    select: {
      id: true,
      companyId: true,
      scopes: true,
      expiresAt: true,
      company: { select: { slug: true } },
    },
  });
  if (!row) return null;
  if (row.expiresAt && row.expiresAt.getTime() <= Date.now()) return null;

  return {
    id: row.id,
    companyId: row.companyId,
    companySlug: row.company.slug,
    scopes: row.scopes,
  };
}

export async function markTokenUsed(id: string, companyId: string): Promise<void> {
  await getDb().apiToken.updateMany({ where: { id, companyId }, data: { lastUsedAt: new Date() } });
}

export async function createToken(
  companyId: string,
  name: string,
  scopes: string[],
  actor?: AuditActor,
): Promise<string> {
  const raw = generateToken();
  if (!actor) {
    await getDb().apiToken.create({
      data: { companyId, name, hash: hashToken(raw), scopes },
    });
    return raw;
  }
  await getDb().$transaction(async (tx) => {
    const row = await tx.apiToken.create({ data: { companyId, name, hash: hashToken(raw), scopes } });
    // The scopes only: never the raw token or its hash (D5).
    await recordAudit(companyId, { actor, action: "audit.token.created", target: { kind: "token", id: row.id }, changes: { scopes: { before: null, after: scopes } }, source: sourceOf(actor) }, tx);
  });
  return raw;
}

const sourceOf = (actor: AuditActor): "settings" | "console" => (actor.kind === "admin" ? "settings" : "console");

/** Delete a token and write `audit.token.revoked` in the same transaction. False when the company has no such token. */
export async function revokeToken(companyId: string, id: string, actor: AuditActor): Promise<boolean> {
  return getDb().$transaction(async (tx) => {
    const { count } = await tx.apiToken.deleteMany({ where: { id, companyId } });
    if (count === 0) return false;
    await recordAudit(companyId, { actor, action: "audit.token.revoked", target: { kind: "token", id }, source: sourceOf(actor) }, tx);
    return true;
  });
}

/** Constant-time compare for anything else that needs it. */
export function sameToken(a: string, b: string): boolean {
  const x = Buffer.from(a);
  const y = Buffer.from(b);
  return x.length === y.length && timingSafeEqual(x, y);
}
