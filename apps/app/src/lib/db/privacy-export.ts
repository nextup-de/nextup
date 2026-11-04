// Data exports (GDP D14): the rows an export is built from and the DataExport bookkeeping. Every query is
// scoped by companyId. A list never carries the file; the file leaves only through exportFile.
import type { Prisma } from "@prisma/client";
import type { Row, ExportRows } from "@/features/privacy/export";
import { getDb } from "@/lib/db/client";
import type { OutboxDraft } from "@/lib/db/outbox";
import type { Tx } from "@/lib/db/org-edit";

export type DataExportRow = Prisma.DataExportGetPayload<{ omit: { file: true } }>;
/** The plain client or a `$transaction` client. */
export type ExportClient = Tx;

const rows = (x: unknown[]): Row[] => x as Row[];

/** The label each person has now: their pseudonym, else the anonymous handle, else the name. By user id only. */
async function identitiesOf(companyId: string): Promise<Record<string, string>> {
  const db = getDb();
  const [users, pseudonyms] = await Promise.all([
    db.user.findMany({ where: { companyId }, select: { id: true, name: true, handle: true } }),
    db.pseudonym.findMany({ where: { companyId }, select: { userId: true, label: true } }),
  ]);
  const out: Record<string, string> = {};
  for (const u of users) out[u.id] = u.handle || u.name;
  for (const p of pseudonyms) out[p.userId] = p.label;
  return out;
}

const head = (companyId: string) =>
  getDb().company.findUniqueOrThrow({ where: { id: companyId }, select: { id: true, slug: true, name: true, mark: true, stage: true, anonymousHandles: true, createdAt: true } });

const USER_OMIT = { employeeId: true, loginCodeHash: true, entraOid: true, totpSecretSealed: true } as const;

export async function companyExportRows(companyId: string): Promise<ExportRows> {
  const db = getDb();
  const w = { where: { companyId } };
  const [company, identities, users, companyProfile, orgUnits, orgRoles, seats, routingRules, goals, companyRules, floorAreas, floorDevices, calendar, companyConfig, events, caseViews, assistTurns, ideaDrafts, tickets, ticketReplies, integrations, auditEvents, retentionRules, privacyPolicy] = await Promise.all([
    head(companyId), identitiesOf(companyId),
    db.user.findMany({ ...w, omit: USER_OMIT, orderBy: { createdAt: "asc" } }),
    db.companyProfile.findMany(w), db.orgUnit.findMany(w), db.orgRole.findMany(w), db.orgRoleHolder.findMany(w),
    db.routingRule.findMany(w), db.goal.findMany(w), db.companyRule.findMany(w), db.floorArea.findMany(w),
    db.floorDevice.findMany({ ...w, omit: { tokenHash: true, pairCodeHash: true } }),
    db.companyCalendar.findMany(w), db.companyConfig.findMany(w),
    db.caseEvent.findMany({ ...w, orderBy: { seq: "asc" } }),
    db.caseView.findMany(w), db.assistTurn.findMany({ ...w, orderBy: { createdAt: "asc" } }),
    db.ideaDraft.findMany({ where: { companyId, status: "published" } }),
    db.ticket.findMany({ ...w, omit: { screenshot: true, screenshotMime: true }, orderBy: { number: "asc" } }),
    db.ticketReply.findMany(w),
    db.integration.findMany({ ...w, omit: { secretSealed: true, webhookSecretSealed: true } }),
    db.auditEvent.findMany({ ...w, orderBy: [{ at: "asc" }, { id: "asc" }] }),
    db.retentionRule.findMany(w), db.privacyPolicy.findMany(w),
  ]);
  return {
    company, exportedAt: new Date(), identities,
    tables: {
      users: rows(users), companyProfile: rows(companyProfile), orgUnits: rows(orgUnits), orgRoles: rows(orgRoles), seats: rows(seats),
      routingRules: rows(routingRules), goals: rows(goals), companyRules: rows(companyRules), floorAreas: rows(floorAreas),
      floorDevices: rows(floorDevices), calendar: rows(calendar), companyConfig: rows(companyConfig), events: rows(events),
      caseViews: rows(caseViews), assistTurns: rows(assistTurns), ideaDrafts: rows(ideaDrafts), tickets: rows(tickets),
      ticketReplies: rows(ticketReplies), integrations: rows(integrations), auditEvents: rows(auditEvents),
      retentionRules: rows(retentionRules), privacyPolicy: rows(privacyPolicy),
    },
  };
}

export async function personExportRows(companyId: string, userId: string): Promise<ExportRows> {
  const db = getDb();
  const w = { companyId };
  const tickets = await db.ticket.findMany({ where: { ...w, reporterId: userId }, orderBy: { number: "asc" } });
  const drafts = await db.ideaDraft.findMany({ where: { ...w, userId } });
  const [company, identities, users, seats, events, caseViews, ticketReplies, notifyPreferences, connections, auditEvents, assistTurns, ideaTurns] = await Promise.all([
    head(companyId), identitiesOf(companyId),
    db.user.findMany({ where: { ...w, id: userId }, omit: USER_OMIT }),
    db.orgRoleHolder.findMany({ where: { ...w, userId } }),
    db.caseEvent.findMany({ where: { ...w, actorUserId: userId }, orderBy: { seq: "asc" } }),
    db.caseView.findMany({ where: { ...w, fromUserId: userId } }),
    db.ticketReply.findMany({ where: { ...w, ticketId: { in: tickets.map((t) => t.id) } } }),
    db.notifyPreference.findMany({ where: { ...w, userId } }),
    db.connection.findMany({ where: { ...w, userId }, select: { id: true, userId: true, provider: true, lastUsedAt: true, createdAt: true, updatedAt: true } }),
    db.auditEvent.findMany({ where: { ...w, OR: [{ actorUserId: userId }, { targetId: userId }] }, orderBy: [{ at: "asc" }, { id: "asc" }] }),
    db.assistTurn.findMany({ where: { ...w, userId }, orderBy: { createdAt: "asc" } }),
    db.ideaTurn.findMany({ where: { ...w, draftId: { in: drafts.map((d) => d.id) } } }),
  ]);
  return {
    company, exportedAt: new Date(), identities,
    tables: {
      users: rows(users), seats: rows(seats), events: rows(events), caseViews: rows(caseViews), tickets: rows(tickets),
      ticketReplies: rows(ticketReplies), notifyPreferences: rows(notifyPreferences), connections: rows(connections),
      auditEvents: rows(auditEvents), assistTurns: rows(assistTurns), ideaDrafts: rows(drafts), ideaTurns: rows(ideaTurns),
    },
  };
}

export async function createExport(companyId: string, a: { kind: "company" | "person"; subjectUserId: string | null; requestedByUserId: string; deliverTo: "person" | "admin"; expiresAt: Date }): Promise<DataExportRow> {
  return getDb().dataExport.create({ data: { companyId, ...a, status: "preparing" }, omit: { file: true } });
}

/** Stores the file and flips the row to ready. Pass the transaction client to make it part of a larger commit. */
export async function markReady(id: string, file: Buffer, size: number, expiresAt: Date, client: ExportClient = getDb()): Promise<void> {
  await client.dataExport.update({ where: { id }, data: { status: "ready", file: new Uint8Array(file), sizeBytes: size, expiresAt, error: null } });
}

export async function markFailed(id: string, error: string): Promise<void> {
  await getDb().dataExport.updateMany({ where: { id }, data: { status: "failed", file: null, error: error.slice(0, 300) || "failed" } });
}

/** The company's exports, newest first, without file bytes. */
export function listExports(companyId: string): Promise<DataExportRow[]> {
  return getDb().dataExport.findMany({ where: { companyId }, omit: { file: true }, orderBy: [{ createdAt: "desc" }, { id: "desc" }] });
}

export function getExport(companyId: string, id: string): Promise<DataExportRow | null> {
  return getDb().dataExport.findFirst({ where: { companyId, id }, omit: { file: true } });
}

/**
 * The file of a ready export, or null. Past `expiresAt` the bytes are dropped and the row is marked expired
 * before null comes back, so an expired file is gone whoever asks.
 */
export async function exportFile(companyId: string, id: string, now: Date): Promise<Buffer | null> {
  const db = getDb();
  const row = await db.dataExport.findFirst({ where: { companyId, id }, select: { status: true, expiresAt: true, file: true } });
  if (!row) return null;
  if (row.expiresAt.getTime() <= now.getTime() || row.status === "expired") {
    if (row.file !== null || row.status !== "expired") await db.dataExport.updateMany({ where: { companyId, id }, data: { file: null, status: "expired" } });
    return null;
  }
  return row.status === "ready" && row.file ? Buffer.from(row.file) : null;
}

/** Writes outbox rows through the caller's client, so the mail commits with the export. Same idempotency as enqueue. */
export async function enqueueIn(client: ExportClient, companyId: string, drafts: OutboxDraft[]): Promise<number> {
  if (drafts.length === 0) return 0;
  const r = await client.outboxMessage.createMany({ data: drafts.map((d) => ({ ...d, companyId })), skipDuplicates: true });
  return r.count;
}

/** Whether the export's time is up, whether or not a download has dropped the bytes yet. */
export const isExpired = (e: { status: string; expiresAt: Date }, now: Date = new Date()): boolean => e.status === "expired" || e.expiresAt.getTime() <= now.getTime();
