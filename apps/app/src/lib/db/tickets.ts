// Bug reports in this stack's database. Every query names its company (the tenant guard in
// client.ts refuses anything else). Pure rules live in features/tickets.
import { Prisma } from "@prisma/client";
import type { TicketReplyMessage, TicketState, TicketStatus } from "@nextup/contracts";
import type { ReportInput, Screenshot } from "@/features/tickets";
import { getDb } from "@/lib/db/client";

export type NewTicket = {
  companyId: string;
  reporterId: string | null;
  reporterRole: string;
  input: Pick<ReportInput, "kind" | "impact" | "description" | "expected">;
  context: Prisma.InputJsonValue;
  screenshot: Screenshot | null;
  /** Demo stacks: picked in the dialog. "" = unknown / nobody. */
  openedBy: string;
  assignee: string;
};

/**
 * Store a report under the next free number of its company. Two reports in the same instant can
 * pick the same number; the unique index turns that into an error, and we simply take the next one.
 */
export async function createTicket(t: NewTicket): Promise<{ id: string; number: number }> {
  const db = getDb();
  for (let attempt = 0; attempt < 5; attempt++) {
    const last = await db.ticket.findFirst({
      where: { companyId: t.companyId },
      orderBy: { number: "desc" },
      select: { number: true },
    });
    try {
      return await db.ticket.create({
        data: {
          companyId: t.companyId,
          number: (last?.number ?? 0) + 1,
          reporterId: t.reporterId,
          reporterRole: t.reporterRole,
          kind: t.input.kind,
          impact: t.input.impact,
          description: t.input.description,
          expected: t.input.expected,
          context: t.context,
          screenshot: t.screenshot ? new Uint8Array(t.screenshot.bytes) : null,
          screenshotMime: t.screenshot?.mime ?? null,
          openedBy: t.openedBy,
          assignee: t.assignee,
        },
        select: { id: true, number: true },
      });
    } catch (e) {
      const clash = e instanceof Prisma.PrismaClientKnownRequestError && e.code === "P2002";
      if (!clash) throw e;
    }
  }
  throw new Error("Could not allocate a ticket number.");
}

export type TicketListRow = {
  id: string;
  number: number;
  kind: string;
  impact: string;
  status: string;
  description: string;
  expected: string;
  reporterRole: string;
  /** Who filed it: their name; null when filed from /admin or the person was deleted. */
  reporterName: string | null;
  /** Who of the NextUp team is on it ("" = nobody yet). */
  assignee: string;
  /** Demo stacks: who of the team (or Marc) opened it; "" = not said. */
  openedBy: string;
  hasScreenshot: boolean;
  forwarded: boolean;
  createdAt: Date;
  replies: { id: string; body: string; status: string; createdAt: Date }[];
};

const listSelect = {
  id: true,
  number: true,
  kind: true,
  impact: true,
  status: true,
  description: true,
  expected: true,
  reporterRole: true,
  reporter: { select: { name: true } },
  assignee: true,
  openedBy: true,
  screenshotMime: true,
  forwardedAt: true,
  createdAt: true,
  replies: { select: { id: true, body: true, status: true, createdAt: true }, orderBy: { createdAt: "asc" as const } },
} satisfies Prisma.TicketSelect;

function toRow(r: Prisma.TicketGetPayload<{ select: typeof listSelect }>): TicketListRow {
  const { screenshotMime, forwardedAt, reporter, ...rest } = r;
  return { ...rest, reporterName: reporter?.name ?? null, hasScreenshot: screenshotMime !== null, forwarded: forwardedAt !== null };
}

/** "My reports": what this person filed, newest first. */
export async function ticketsOf(companyId: string, reporterId: string): Promise<TicketListRow[]> {
  const rows = await getDb().ticket.findMany({
    where: { companyId, reporterId },
    orderBy: { createdAt: "desc" },
    take: 100,
    select: listSelect,
  });
  return rows.map(toRow);
}

/** /admin -> Tickets: every report of a company, newest first. */
export async function ticketsOfCompany(companyId: string): Promise<TicketListRow[]> {
  const rows = await getDb().ticket.findMany({
    where: { companyId },
    orderBy: { createdAt: "desc" },
    take: 200,
    select: listSelect,
  });
  return rows.map(toRow);
}

export async function openTicketCount(companyIds: string[]): Promise<number> {
  if (companyIds.length === 0) return 0;
  return getDb().ticket.count({ where: { companyId: { in: companyIds }, status: { in: ["new", "in_progress"] } } });
}

/** The screenshot of one report, for its owner or an admin - the caller checks which. */
export async function ticketScreenshot(companyId: string, id: string) {
  return getDb().ticket.findFirst({
    where: { companyId, id },
    select: { reporterId: true, screenshot: true, screenshotMime: true },
  });
}

// ── Sync with admin.sellux.ch (server/tickets-sync.ts) ────────────────────────────────────────────

export async function ticketsToForward(companyId: string, limit = 20) {
  return getDb().ticket.findMany({
    where: { companyId, forwardedAt: null },
    orderBy: { createdAt: "asc" },
    take: limit,
    select: {
      id: true,
      number: true,
      kind: true,
      impact: true,
      description: true,
      expected: true,
      reporterId: true,
      reporterRole: true,
      context: true,
      screenshot: true,
      screenshotMime: true,
      createdAt: true,
      openedBy: true,
      assignee: true,
    },
  });
}

export async function markForwarded(companyId: string, id: string, error: string | null): Promise<void> {
  await getDb().ticket.updateMany({
    where: { companyId, id },
    data: error ? { forwardError: error.slice(0, 500) } : { forwardedAt: new Date(), forwardError: null },
  });
}

/** Where to ask admin.sellux.ch from: the newest reply we already have (inclusive; dupes are skipped). */
export async function lastReplyAt(companyId: string): Promise<Date | null> {
  const r = await getDb().ticketReply.findFirst({
    where: { companyId },
    orderBy: { createdAt: "desc" },
    select: { createdAt: true },
  });
  return r?.createdAt ?? null;
}

export type StoredReply = { replyId: string; ticketNumber: number; status: TicketStatus; body: string; reporterEmail: string | null };

/**
 * Store replies fetched from admin.sellux.ch and move each ticket to the status it reports.
 * Returns only the replies that are new here - the ones the reporter still has to be told about.
 */
export async function saveReplies(companyId: string, replies: TicketReplyMessage[]): Promise<StoredReply[]> {
  const db = getDb();
  const fresh: StoredReply[] = [];
  for (const r of replies) {
    const ticket = await db.ticket.findFirst({
      where: { companyId, id: r.stackTicketId },
      select: { id: true, number: true, reporter: { select: { email: true } } },
    });
    if (!ticket) continue; // a ticket deleted here since; nothing to attach it to
    const known = await db.ticketReply.findFirst({ where: { companyId, opsReplyId: r.id }, select: { id: true } });
    if (known) continue;
    const saved = await db.ticketReply.create({
      data: {
        companyId,
        ticketId: ticket.id,
        opsReplyId: r.id,
        body: r.body,
        status: r.status,
        createdAt: new Date(r.createdAt),
      },
      select: { id: true },
    });
    await db.ticket.updateMany({ where: { companyId, id: ticket.id }, data: { status: r.status } });
    fresh.push({
      replyId: saved.id,
      ticketNumber: ticket.number,
      status: r.status,
      body: r.body,
      reporterEmail: ticket.reporter?.email ?? null,
    });
  }
  return fresh;
}

export async function markEmailed(companyId: string, replyId: string): Promise<void> {
  await getDb().ticketReply.updateMany({ where: { companyId, id: replyId }, data: { emailedAt: new Date() } });
}

/** Store who admin.sellux.ch says is on each ticket. Tickets not in this stack (any more) are skipped. */
export async function saveAssignees(companyId: string, tickets: TicketState[]): Promise<void> {
  const db = getDb();
  for (const t of tickets) {
    await db.ticket.updateMany({ where: { companyId, id: t.stackTicketId, NOT: { assignee: t.assignee } }, data: { assignee: t.assignee } });
  }
}
