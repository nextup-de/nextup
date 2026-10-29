// People's own connections to sources NextUp reads on their behalf (Connection rows) and the company
// switch that allows them. docs/plans/2026-10-22_sso-and-data-access.md, phase 2. Every query is
// scoped by company; tokens go in sealed (features/connectors/vault.ts) and never come back out here.
import { getDb } from "@/lib/db/client";

export const M365 = "m365";

/** Is live Microsoft 365 search switched on for this company? Off when there is no config row. */
export async function m365SearchOn(companyId: string): Promise<boolean> {
  const cfg = await getDb().companyConfig.findUnique({ where: { companyId }, select: { m365Search: true } });
  return cfg?.m365Search ?? false;
}

export async function setM365Search(companyId: string, on: boolean): Promise<void> {
  await getDb().companyConfig.upsert({ where: { companyId }, create: { companyId, m365Search: on }, update: { m365Search: on } });
}

/** Store (or replace) a person's Microsoft 365 connection. A new connection clears an old error. */
export async function saveConnection(p: {
  companyId: string;
  userId: string;
  scopes: string[];
  refreshTokenSealed: string;
}): Promise<void> {
  const data = { scopes: p.scopes, refreshTokenSealed: p.refreshTokenSealed, lastError: null };
  await getDb().connection.upsert({
    where: { companyId_userId_provider: { companyId: p.companyId, userId: p.userId, provider: M365 } },
    create: { companyId: p.companyId, userId: p.userId, provider: M365, ...data },
    update: data,
  });
}

export type ConnectionStatus = { connectedAt: Date; lastUsedAt: Date | null; lastError: string | null } | null;

/** What the profile page shows: connected since when, and whether it has to be renewed. */
export async function connectionStatus(companyId: string, userId: string): Promise<ConnectionStatus> {
  const row = await getDb().connection.findFirst({
    where: { companyId, userId, provider: M365 },
    select: { createdAt: true, lastUsedAt: true, lastError: true },
  });
  return row ? { connectedAt: row.createdAt, lastUsedAt: row.lastUsedAt, lastError: row.lastError } : null;
}

/** Disconnect one person. True when there was something to remove. */
export async function deleteConnection(companyId: string, userId: string): Promise<boolean> {
  const r = await getDb().connection.deleteMany({ where: { companyId, userId, provider: M365 } });
  return r.count > 0;
}

/** The admin's way out: everyone in the company disconnected at once. Returns how many. */
export async function deleteAllConnections(companyId: string): Promise<number> {
  const r = await getDb().connection.deleteMany({ where: { companyId, provider: M365 } });
  return r.count;
}

/**
 * The sealed token to redeem (server/graph-token.ts), or null when the person is not connected or
 * Microsoft already refused it - then nothing is tried until they connect again.
 */
export async function sealedRefreshToken(companyId: string, userId: string): Promise<string | null> {
  const row = await getDb().connection.findFirst({
    where: { companyId, userId, provider: M365, lastError: null },
    select: { refreshTokenSealed: true },
  });
  return row?.refreshTokenSealed ?? null;
}

/** After a redeem: the rotated token (when Microsoft sent one) goes in, and the use is noted. */
export async function connectionUsed(companyId: string, userId: string, refreshTokenSealed: string | null): Promise<void> {
  await getDb().connection.updateMany({
    where: { companyId, userId, provider: M365 },
    data: { lastUsedAt: new Date(), ...(refreshTokenSealed ? { refreshTokenSealed } : {}) },
  });
}

/** Microsoft refused the token for good: the profile shows "connect again". */
export async function connectionRefused(companyId: string, userId: string, why: string): Promise<void> {
  await getDb().connection.updateMany({ where: { companyId, userId, provider: M365 }, data: { lastError: why.slice(0, 200) } });
}

export async function countConnections(companyId: string): Promise<number> {
  return getDb().connection.count({ where: { companyId, provider: M365 } });
}
