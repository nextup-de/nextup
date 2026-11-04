// NextUp support grants (SEC/D7). One implementation for both doors: a company admin in Settings and a
// console admin in /admin/support. Each change and its audit row share one transaction, so a grant is
// never on the books without its row. Only the scrypt hash of the code is stored; the code is returned once.
import type { SupportGrant } from "@prisma/client";
import type { AuditActor } from "@/server/audit/record";
import { recordAudit, settingsActor } from "@/server/audit/record";
import type { AuditSource } from "@/features/audit";
import { extendTo, grantActive, hashSupportCode, newSupportCode } from "@/features/admin/support-code";
import { listAudit } from "@/lib/db/audit";
import { getDb } from "./client";

export const GRANT_LOG_PAGE = 20;
export const SUPPORT_AUDIT_ACTIONS = [
  "audit.access.support_granted",
  "audit.access.support_extended",
  "audit.access.support_revoked",
  "audit.access.support_signin",
];

const HOUR = 3_600_000;
const open = (companyId: string, now: Date) => ({ companyId, revokedAt: null, expiresAt: { gt: now } });

export type OpenGrantInput = {
  hours: number;
  reason?: string | null;
  grantedById?: string | null;
  /** Who opened it, for the console's "opened by" line. Defaults to the granting user. */
  openedBy?: string;
  actor?: AuditActor;
  source?: AuditSource;
  now?: Date;
};

/** Opens a grant and ends any older open one. The code is in the result and nowhere else. */
export async function openGrant(companyId: string, input: OpenGrantInput): Promise<{ grant: SupportGrant; code: string }> {
  const now = input.now ?? new Date();
  const code = newSupportCode();
  const expiresAt = new Date(now.getTime() + input.hours * HOUR);
  const actor = input.actor ?? (input.grantedById ? settingsActor({ userId: input.grantedById }) : undefined);
  if (!actor) throw new Error("support grant: no actor");
  const grant = await getDb().$transaction(async (tx) => {
    // At most one active grant per company: the older one ends now.
    await tx.supportGrant.updateMany({ where: open(companyId, now), data: { revokedAt: now } });
    const g = await tx.supportGrant.create({
      data: {
        companyId,
        codeHash: hashSupportCode(code),
        expiresAt,
        openedBy: input.openedBy ?? `company:${input.grantedById ?? "unknown"}`,
        reason: input.reason ?? null,
        grantedById: input.grantedById ?? null,
      },
    });
    // Never the code, its hash or the reason's text.
    await recordAudit(
      companyId,
      {
        actor,
        action: "audit.access.support_granted",
        target: { kind: "support_grant", id: g.id },
        changes: { expiresAt: { before: null, after: expiresAt.toISOString() } },
        source: input.source ?? "settings",
      },
      tx,
    );
    return g;
  });
  return { grant, code };
}

/** The open grant of the company, or null. */
export async function activeGrant(companyId: string, now: Date): Promise<SupportGrant | null> {
  const rows = await getDb().supportGrant.findMany({ where: open(companyId, now), orderBy: { expiresAt: "desc" } });
  return rows.find((g) => grantActive(g, now)) ?? null;
}

/** Moves the end of the open grant (never past 72 h from now). Null when none is open. */
export async function extendGrant(companyId: string, hours: number, now: Date, byUserId: string): Promise<SupportGrant | null> {
  return getDb().$transaction(async (tx) => {
    const g = await tx.supportGrant.findFirst({ where: open(companyId, now), orderBy: { expiresAt: "desc" } });
    if (!g) return null;
    const expiresAt = extendTo(g.expiresAt, hours, now);
    const next = await tx.supportGrant.update({ where: { id: g.id }, data: { expiresAt, extendedAt: now } });
    await recordAudit(
      companyId,
      {
        actor: settingsActor({ userId: byUserId }),
        action: "audit.access.support_extended",
        target: { kind: "support_grant", id: g.id },
        changes: { expiresAt: { before: g.expiresAt.toISOString(), after: expiresAt.toISOString() } },
        source: "settings",
      },
      tx,
    );
    return next;
  });
}

/** Ends the open grant now. False when none is open. A support session on it stops at its next request. */
export async function endGrant(companyId: string, byUserId: string, now: Date = new Date()): Promise<boolean> {
  return getDb().$transaction(async (tx) => {
    const g = await tx.supportGrant.findMany({ where: open(companyId, now), select: { id: true } });
    if (g.length === 0) return false;
    await tx.supportGrant.updateMany({ where: open(companyId, now), data: { revokedAt: now } });
    await recordAudit(
      companyId,
      { actor: settingsActor({ userId: byUserId }), action: "audit.access.support_revoked", target: { kind: "support_grant", id: g[0].id }, source: "settings" },
      tx,
    );
    return true;
  });
}

export type GrantLogRow = {
  id: string;
  at: Date;
  action: string;
  actorKind: string;
  actorUserId: string | null;
  hours: number | null;
  until: string | null;
};
export type GrantCursor = { at: Date; id: string };
export type GrantLogPage = { rows: GrantLogRow[]; next: GrantCursor | null };

/** The grant log: the support audit rows, newest first, 20 a page. */
export async function grantLog(companyId: string, cursor?: GrantCursor): Promise<GrantLogPage> {
  const got = await listAudit(companyId, { actions: SUPPORT_AUDIT_ACTIONS, cursor, take: GRANT_LOG_PAGE + 1 });
  const page = got.slice(0, GRANT_LOG_PAGE);
  const rows = page.map((r): GrantLogRow => {
    const ch = (r.changes ?? {}) as Record<string, { after?: unknown } | undefined>;
    const until = ch.expiresAt?.after;
    const end = typeof until === "string" ? until : null;
    // A grant's length is its end minus the moment it was written.
    const hours = r.action === "audit.access.support_granted" && end ? Math.round((new Date(end).getTime() - r.at.getTime()) / HOUR) : null;
    return { id: r.id, at: r.at, action: r.action, actorKind: r.actorKind, actorUserId: r.actorUserId, hours, until: end };
  });
  const last = page[page.length - 1];
  return { rows, next: got.length > GRANT_LOG_PAGE && last ? { at: last.at, id: last.id } : null };
}
