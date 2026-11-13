// Delivery (plan NTF, D9): take the due pending rows of the outbox, send each through its registered channel, and
// record the outcome. claimDue counts the attempt and leases the row, so two runs never send one row twice.
import type { NotifyMessage, NotifyResult } from "@nextup/contracts/public";
import { getDb } from "@/lib/db/client";
import { claimDue, enqueue, markFailed, markRetry, markSent, markSkipped, type OutboxRow } from "@/lib/db/outbox";
import { failedWithMail, mailInstead, TEAMS_ATTEMPTS } from "@/features/notify/fallback";
import { PILOT_REPORT_TEMPLATE } from "@/features/pilot/report-mail";
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

/**
 * The pilot report is checked again at send time, on every attempt: the row was planned days ago. Returns why it
 * must not go out, or null. A mail a relay already took cannot be recalled; this only stops the next one.
 */
async function pilotReportBlock(row: OutboxRow): Promise<string | null> {
  const db = getDb();
  if (!row.recipientUserId) return "no recipient";
  // Scoped by the row's company: a user of another company is simply not found.
  const user = await db.user.findFirst({ where: { id: row.recipientUserId, companyId: row.companyId }, select: { active: true, role: true, email: true } });
  if (!user) return "recipient is not a user of the row's company";
  if (!user.active) return "recipient is not an active user";
  if (user.role !== "manager") return "recipient is not a manager";
  const pref = await db.notifyPreference.findFirst({ where: { companyId: row.companyId, userId: row.recipientUserId, template: PILOT_REPORT_TEMPLATE }, select: { on: true } });
  if (!pref?.on) return "pilot.report is off for the recipient";
  const company = await db.company.findUnique({ where: { id: row.companyId }, select: { stage: true } });
  if (company?.stage !== "pilot" && company?.stage !== "live") return "company is not in pilot or live";
  if (!row.address || row.address.trim().toLowerCase() !== user.email.trim().toLowerCase()) return "address is not the recipient's current email";
  return null;
}

/**
 * A Teams card that could not be delivered: write the mail for the same notice (decision Q2.11). True when the
 * person has an address, so a mail row for this notice exists; its key stops a second one. Never throws: the
 * card is settled either way.
 */
async function writeMailInstead(row: OutboxRow): Promise<boolean> {
  if (row.channel !== "teams" || !row.recipientUserId) return false;
  try {
    // Scoped by the row's company: a user of another company is simply not found. Someone who left gets no mail.
    const user = await getDb().user.findFirst({ where: { id: row.recipientUserId, companyId: row.companyId, active: true }, select: { email: true } });
    const draft = mailInstead(row, user?.email ?? null);
    if (!draft) return false;
    await enqueue(row.companyId, [draft]);
    return true;
  } catch (e) {
    console.warn("[notify] teams", row.id, "failed, and no mail could be written instead:", e instanceof Error ? e.message : String(e));
    return false;
  }
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
    if (row.template === PILOT_REPORT_TEMPLATE) {
      const why = await pilotReportBlock(row).catch(() => "check failed");
      if (why) {
        await markSkipped(row.id, why);
        continue;
      }
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
    } else {
      // A card is given up early for the mail (TEAMS_ATTEMPTS), but only when there is a mail to write: a person
      // without an address keeps the whole ladder.
      const over = !result.retryable || row.attempt >= MAX_ATTEMPTS;
      const tryMail = row.channel === "teams" && (over || row.attempt >= TEAMS_ATTEMPTS);
      const mailed = tryMail ? await writeMailInstead(row) : false;
      if (over || mailed) {
        await markFailed(row.id, mailed ? failedWithMail(result.error) : result.error);
        count.failed++;
      } else {
        await markRetry(row.id, new Date(now.getTime() + BACKOFF_MS[row.attempt - 1]), result.error);
        count.retried++;
      }
    }
  }
  return count;
}
