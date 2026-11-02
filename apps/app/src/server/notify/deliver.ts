// Delivery (plan NTF, D9): take the due pending rows of the outbox, send each through its registered channel, and
// record the outcome. claimDue counts the attempt and leases the row, so two runs never send one row twice.
import type { NotifyMessage, NotifyResult } from "@nextup/contracts/public";
import { getDb } from "@/lib/db/client";
import { claimDue, markFailed, markRetry, markSent, type OutboxRow } from "@/lib/db/outbox";
import { MAIL_WAITING } from "./channels/mail";
import { channelFor } from "./registry";

export const DELIVER_BATCH = 50;
/** Wait after failed attempt 1..5; attempt 6 is the last. */
export const BACKOFF_MS = [1, 5, 30, 120, 720].map((m) => m * 60_000);
export const MAX_ATTEMPTS = BACKOFF_MS.length + 1;
/** How long a mail row waits for a relay before it is looked at again. */
const WAIT_MS = 5 * 60_000;

export type DeliverCount = { sent: number; retried: number; failed: number; waiting: number };

function messageOf(row: OutboxRow, now: Date): NotifyMessage {
  const data = row.data && typeof row.data === "object" && !Array.isArray(row.data) ? (row.data as Record<string, unknown>) : {};
  return {
    id: row.id,
    companyId: row.companyId,
    recipient: { userId: row.recipientUserId ?? "", address: row.address },
    template: row.template,
    locale: row.locale === "de" ? "de" : "en",
    subject: row.subject,
    text: row.text,
    link: row.link,
    // attempt and sentAt are the delivery's, so a row cannot forge them.
    data: { ...data, attempt: row.attempt, sentAt: now.toISOString() },
  };
}

export async function deliverOnce(now: Date = new Date()): Promise<DeliverCount> {
  const count: DeliverCount = { sent: 0, retried: 0, failed: 0, waiting: 0 };
  const rows = await claimDue(now, DELIVER_BATCH);
  for (const row of rows) {
    const channel = channelFor(row.channel);
    if (!channel) {
      await markFailed(row.id, `no channel "${row.channel}" is registered`);
      count.failed++;
      continue;
    }
    let result: NotifyResult;
    try {
      result = await channel.send(messageOf(row, now));
    } catch (e) {
      result = { ok: false, error: e instanceof Error ? e.message : String(e), retryable: true };
    }
    if (result.ok) {
      await markSent(row.id, now);
      count.sent++;
    } else if (result.error === MAIL_WAITING && row.channel === "mail") {
      // No relay: not a failed try. Give the attempt back and look again later.
      await getDb().outboxMessage.updateMany({
        where: { id: row.id },
        data: { attempt: row.attempt - 1, nextAt: new Date(now.getTime() + WAIT_MS), status: "pending" },
      });
      count.waiting++;
    } else if (!result.retryable || row.attempt >= MAX_ATTEMPTS) {
      await markFailed(row.id, result.error);
      count.failed++;
    } else {
      await markRetry(row.id, new Date(now.getTime() + BACKOFF_MS[row.attempt - 1]), result.error);
      count.retried++;
    }
  }
  return count;
}
