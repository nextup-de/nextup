// How a directory recognises someone who was pseudonymised (FX5). Pseudonymising clears their ids and email, so
// a source that still lists them would make a new person of them. What stays is a hash, as an ExternalIdentity
// row of their own provider: it can answer "is this them?" but cannot be read back into the id.
import { createHash } from "node:crypto";
import { getDb } from "./client";
import type { Tx } from "./org-edit";

const PROVIDER = "former";
const ISSUER = "directory";

const hashOf = (companyId: string, value: string) => createHash("sha256").update(`${companyId}:${value.trim().toLowerCase()}`).digest("hex");

/** Keeps the hashes of these ids of a person who is being pseudonymised. Empty ones are left out. */
export async function keepFormerKeys(tx: Tx, companyId: string, userId: string, values: readonly (string | null)[]): Promise<void> {
  const keys = values.filter((v): v is string => Boolean(v?.trim()));
  await tx.externalIdentity.createMany({
    data: keys.map((v) => ({ companyId, userId, provider: PROVIDER, issuer: ISSUER, subject: hashOf(companyId, v) })),
    skipDuplicates: true,
  });
}

/** The company's check: does this source key or email belong to someone pseudonymised? */
export async function formerCheck(companyId: string): Promise<(value: string | null | undefined) => boolean> {
  const rows = await getDb().externalIdentity.findMany({ where: { companyId, provider: PROVIDER, issuer: ISSUER }, select: { subject: true } });
  const known = new Set(rows.map((r) => r.subject));
  return (value) => known.size > 0 && Boolean(value?.trim()) && known.has(hashOf(companyId, value as string));
}
