// The outbox (docs/adr/0004-webhook-and-outbox.md): messages a planner decided to send and the delivery's
// bookkeeping on them. (companyId, key) is the idempotency key. Reads and writes for one company are scoped
// by it; claimDue is the delivery's, across companies, and takes rows by their own id.
import { Prisma } from "@prisma/client";
import { getDb } from "@/lib/db/client";

/** MAX stored error text; cut so one bad response cannot fill the row. */
const MAX_ERROR = 500;

/** Every column a planner sets. The rest (attempt, nextAt, sentAt) is the delivery's. */
export type OutboxDraft = {
  channel: string;
  key: string;
  recipientUserId: string | null;
  address: string | null;
  template: string;
  locale: string;
  subject: string;
  text: string;
  link: string | null;
  data: Prisma.InputJsonValue;
  status: "pending" | "skipped";
  lastError: string | null;
};

export type OutboxRow = Prisma.OutboxMessageGetPayload<object>;

/** Write the drafts; one whose (company, key) exists is left alone. Returns how many rows were written. */
export async function enqueue(companyId: string, drafts: OutboxDraft[]): Promise<number> {
  if (drafts.length === 0) return 0;
  const r = await getDb().outboxMessage.createMany({
    data: drafts.map((d) => ({ ...d, companyId })),
    skipDuplicates: true,
  });
  return r.count;
}

/** The company's messages, oldest first; newest first when a `limit` is given. */
export async function listOutbox(companyId: string, f: { status?: string; template?: string; key?: string; channel?: string; limit?: number } = {}): Promise<OutboxRow[]> {
  return getDb().outboxMessage.findMany({
    where: {
      companyId,
      ...(f.status !== undefined ? { status: f.status } : {}),
      ...(f.template !== undefined ? { template: f.template } : {}),
      ...(f.key !== undefined ? { key: f.key } : {}),
      ...(f.channel !== undefined ? { channel: f.channel } : {}),
    },
    orderBy: f.limit !== undefined ? [{ createdAt: "desc" }, { id: "desc" }] : [{ createdAt: "asc" }, { id: "asc" }],
    ...(f.limit !== undefined ? { take: f.limit } : {}),
  });
}

/** How long a claimed row stays out of reach; a delivery that dies mid-send finds the row due again after it. */
const CLAIM_LEASE_MS = 5 * 60_000;

/**
 * Take up to `limit` pending rows that are due. Each is moved to attempt + 1 with a guard on the attempt it
 * had when read, so of two concurrent callers only one wins a row, and its nextAt is pushed out by a lease so
 * a later call does not take it again before the delivery has marked it. The rows come back as they were
 * claimed (attempt already counted).
 */
export async function claimDue(now: Date, limit: number): Promise<OutboxRow[]> {
  const db = getDb();
  const due = await db.outboxMessage.findMany({
    where: { status: "pending", nextAt: { lte: now } },
    orderBy: [{ nextAt: "asc" }, { id: "asc" }],
    take: limit,
  });
  const won: OutboxRow[] = [];
  for (const row of due) {
    const r = await db.outboxMessage.updateMany({
      where: { id: row.id, status: "pending", attempt: row.attempt },
      data: { attempt: row.attempt + 1, nextAt: new Date(now.getTime() + CLAIM_LEASE_MS) },
    });
    if (r.count === 1) won.push({ ...row, attempt: row.attempt + 1 });
  }
  return won;
}

/** Delivered. */
export async function markSent(id: string, now: Date): Promise<void> {
  await getDb().outboxMessage.updateMany({ where: { id }, data: { status: "sent", sentAt: now, lastError: null } });
}

/** Failed this time; try again at `nextAt`. */
export async function markRetry(id: string, nextAt: Date, error: string): Promise<void> {
  await getDb().outboxMessage.updateMany({ where: { id }, data: { status: "pending", nextAt, lastError: error.slice(0, MAX_ERROR) || "failed" } });
}

/** Given up. */
export async function markFailed(id: string, error: string): Promise<void> {
  await getDb().outboxMessage.updateMany({ where: { id }, data: { status: "failed", lastError: error.slice(0, MAX_ERROR) || "failed" } });
}
