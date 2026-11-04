// What the Sign-in settings page reads besides the Integration rows (EID-P1): the second-factor count, the
// SCIM token's dates and the SCIM activity of the last 7 days. Every query is scoped by company; nothing
// secret leaves here.
import { getDb } from "@/lib/db/client";
import { listAudit } from "@/lib/db/audit";
import { listTokens } from "@/lib/db/tokens";

const DAY_MS = 24 * 60 * 60 * 1000;

export type SecondFactor = { set: number; managers: number };

/** Active managers, and how many of them have confirmed an authenticator app. */
export async function secondFactorCount(companyId: string): Promise<SecondFactor> {
  const where = { companyId, role: "manager", active: true };
  const [managers, set] = await Promise.all([
    getDb().user.count({ where }),
    getDb().user.count({ where: { ...where, totpEnabledAt: { not: null } } }),
  ]);
  return { set, managers };
}

export type ScimActivity = { added: number; updated: number; deactivated: number };

const num = (changes: unknown, key: string): number => {
  const c = typeof changes === "object" && changes !== null ? (changes as Record<string, unknown>)[key] : null;
  const after = typeof c === "object" && c !== null ? (c as { after?: unknown }).after : null;
  return typeof after === "number" ? after : 0;
};

/** The sums of the `audit.directory.scim` rows of the last 7 days (each row is one request that changed something). */
export async function scimActivity(companyId: string, now: Date): Promise<ScimActivity> {
  const from = new Date(now.getTime() - 7 * DAY_MS);
  const sum: ScimActivity = { added: 0, updated: 0, deactivated: 0 };
  let cursor: { at: Date; id: string } | undefined;
  for (let page = 0; page < 25; page++) {
    const rows = await listAudit(companyId, { actions: ["audit.directory.scim"], from, take: 200, cursor });
    for (const r of rows) {
      sum.added += num(r.changes, "added");
      sum.updated += num(r.changes, "updated");
      sum.deactivated += num(r.changes, "deactivated");
    }
    if (rows.length < 200) break;
    const last = rows[rows.length - 1];
    cursor = { at: last.at, id: last.id };
  }
  return sum;
}

export type ScimTokenInfo = { createdAt: Date; lastUsedAt: Date | null };

/** The live SCIM token with this id, or null. */
export async function scimTokenInfo(companyId: string, tokenId: string): Promise<ScimTokenInfo | null> {
  const t = (await listTokens(companyId)).find((x) => x.id === tokenId && !x.revokedAt);
  return t ? { createdAt: t.createdAt, lastUsedAt: t.lastUsedAt } : null;
}

/** A name for the test line: the user's display name, or null when the id is not one of this company's. */
export async function userNameOf(companyId: string, userId: string): Promise<string | null> {
  const u = await getDb().user.findFirst({ where: { id: userId, companyId }, select: { name: true } });
  return u?.name ?? null;
}
