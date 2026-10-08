// Errors this stack ran into, one row per kind (features/errors, prisma/schema.prisma ErrorGroup).
// Written once a minute by src/server/errors.ts from what it counted in memory. Not a tenant table:
// a row holds no company data by construction, so no query here names a company.
import type { ErrorGroup as Counted, StoredErrorGroup } from "@/features/errors";
import { getDb } from "@/lib/db/client";

const KEEP_DAYS = 30;
const MAX_ROWS = 1000;

/** Add one round's counts: a new kind becomes a row, a known one counts up. Either way it waits to be sent. */
export async function saveErrorGroups(groups: Counted[], appCommit: string | null): Promise<void> {
  const db = getDb();
  for (const g of groups) {
    await db.errorGroup.upsert({
      where: { fingerprint: g.fingerprint },
      create: {
        fingerprint: g.fingerprint,
        source: g.source,
        name: g.name,
        message: g.message,
        frame: g.frame,
        route: g.route,
        count: g.count,
        firstSeenAt: new Date(g.firstSeen),
        lastSeenAt: new Date(g.lastSeen),
        appCommit,
      },
      update: {
        count: { increment: g.count },
        lastSeenAt: new Date(g.lastSeen),
        ...(g.frame ? { frame: g.frame } : {}),
        appCommit,
        pending: true,
      },
    });
  }
}

/** Forget kinds not seen for 30 days, and never keep more than 1000 rows (the oldest go first). */
export async function pruneErrorGroups(now: number): Promise<void> {
  const db = getDb();
  await db.errorGroup.deleteMany({ where: { lastSeenAt: { lt: new Date(now - KEEP_DAYS * 86_400_000) } } });
  const extra = (await db.errorGroup.count()) - MAX_ROWS;
  if (extra <= 0) return;
  const oldest = await db.errorGroup.findMany({ orderBy: { lastSeenAt: "asc" }, take: extra, select: { id: true } });
  await db.errorGroup.deleteMany({ where: { id: { in: oldest.map((r) => r.id) } } });
}

/** The kinds counted since the last send, oldest first - at most one batch. */
export async function pendingErrorGroups(limit = 50): Promise<StoredErrorGroup[]> {
  return getDb().errorGroup.findMany({
    where: { pending: true },
    orderBy: { lastSeenAt: "asc" },
    take: limit,
    select: {
      fingerprint: true,
      source: true,
      name: true,
      message: true,
      frame: true,
      route: true,
      count: true,
      firstSeenAt: true,
      lastSeenAt: true,
      appCommit: true,
    },
  });
}

/**
 * admin.sellux.ch has these. A kind counted again while the batch was on its way (a later
 * lastSeenAt) stays pending, so its new count goes out next round.
 */
export async function markErrorsSent(sent: Pick<StoredErrorGroup, "fingerprint" | "lastSeenAt">[], now: Date): Promise<void> {
  const db = getDb();
  for (const s of sent) {
    await db.errorGroup.updateMany({
      where: { fingerprint: s.fingerprint, lastSeenAt: { lte: s.lastSeenAt } },
      data: { pending: false, forwardedAt: now, forwardError: null },
    });
  }
}

/** The send failed: say why on each row; they stay pending and go next round. */
export async function markErrorsFailed(fingerprints: string[], why: string): Promise<void> {
  await getDb().errorGroup.updateMany({ where: { fingerprint: { in: fingerprints } }, data: { forwardError: why.slice(0, 500) } });
}
