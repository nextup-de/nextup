// The audit trail's table (GDP D11). Append and read only: there is no update here and no delete either -
// the retention run deletes with its own query (D16). `client` lets the caller put the audit row into the
// transaction of the change it records.
import { Prisma } from "@prisma/client";
import { getDb } from "@/lib/db/client";
import type { ActorKind, AuditSource } from "@/features/audit";

export type AuditRow = Prisma.AuditEventGetPayload<object>;

export type AuditDraft = {
  companyId: string;
  actorKind: ActorKind;
  actorUserId: string | null;
  action: string;
  targetKind: string | null;
  targetId: string | null;
  changes: Prisma.InputJsonValue;
  source: AuditSource;
};

/** The client of a `$transaction(async (tx) => …)` or the plain one. */
export type AuditClient = { auditEvent: { create(args: { data: AuditDraft }): PromiseLike<AuditRow> } };

export type AuditFilter = {
  from?: Date;
  to?: Date;
  actions?: string[];
  actorKinds?: ActorKind[];
  actorUserId?: string;
  targetKind?: string;
  targetId?: string;
};

export type AuditPage = AuditFilter & {
  /** The last row of the page before: the next page starts after it. */
  cursor?: { at: Date; id: string };
  take: number;
};

const MAX_TAKE = 200;

export async function appendAudit(row: AuditDraft, client?: AuditClient): Promise<AuditRow> {
  const db = client ?? getDb();
  return db.auditEvent.create({ data: row });
}

function whereOf(companyId: string, f: AuditFilter): Prisma.AuditEventWhereInput {
  return {
    companyId,
    ...(f.from || f.to ? { at: { ...(f.from ? { gte: f.from } : {}), ...(f.to ? { lt: f.to } : {}) } } : {}),
    ...(f.actions?.length ? { action: { in: f.actions } } : {}),
    ...(f.actorKinds?.length ? { actorKind: { in: f.actorKinds } } : {}),
    ...(f.actorUserId ? { actorUserId: f.actorUserId } : {}),
    ...(f.targetKind ? { targetKind: f.targetKind } : {}),
    ...(f.targetId ? { targetId: f.targetId } : {}),
  };
}

/** Newest first (ties by id), at most 200 a call. */
export async function listAudit(companyId: string, p: AuditPage): Promise<AuditRow[]> {
  const take = Math.max(0, Math.min(Math.floor(p.take), MAX_TAKE));
  const where = whereOf(companyId, p);
  const after = p.cursor
    ? { OR: [{ at: { lt: p.cursor.at } }, { at: p.cursor.at, id: { lt: p.cursor.id } }] }
    : null;
  return getDb().auditEvent.findMany({
    where: after ? { AND: [where, after] } : where,
    orderBy: [{ at: "desc" }, { id: "desc" }],
    take,
  });
}

export async function countAudit(companyId: string, filter: AuditFilter = {}): Promise<number> {
  return getDb().auditEvent.count({ where: whereOf(companyId, filter) });
}

/** The newest row of one action, or null. For "last saved … by …" lines. */
export async function lastAudit(companyId: string, action: string): Promise<AuditRow | null> {
  return getDb().auditEvent.findFirst({ where: { companyId, action }, orderBy: [{ at: "desc" }, { id: "desc" }] });
}
