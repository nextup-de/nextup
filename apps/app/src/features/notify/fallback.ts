// A Teams card that cannot be delivered goes out as mail for the same notice (decision Q2.11). Pure: the failed
// row and the person's address in, the mail draft out. The delivery (server/notify/deliver.ts) writes it.
import type { Prisma } from "@prisma/client";
import type { OutboxDraft } from "@/lib/db/outbox";

/** A card that still fails after this many tries is given up for the mail, when the person has an address. */
export const TEAMS_ATTEMPTS = 3;

/** Added to the failed Teams row's error, so Settings -> Notifications says the person was still written to. */
export const MAILED_INSTEAD = "a mail was written instead";

/** One mail per notice: a Teams row that is retried and fails again finds this key taken. */
export const fallbackKey = (key: string): string => `${key}:mail`;

export type FailedCard = {
  id: string; channel: string; key: string; recipientUserId: string | null; template: string; locale: string;
  subject: string; text: string; link: string | null; data: unknown;
};

/**
 * The mail for a Teams row that failed, or null: not a Teams row, nobody to send to, or no address. The text is
 * the row's own; the planner writes every notice so that it reads as a mail. The data is the row's too, so a
 * `raised` mail still notes itself on the case. The row passed the gate when it was planned, so the mail is pending.
 */
export function mailInstead(row: FailedCard, email: string | null): OutboxDraft | null {
  const address = email?.trim() ?? "";
  if (row.channel !== "teams" || !row.recipientUserId || !address) return null;
  const data = row.data && typeof row.data === "object" && !Array.isArray(row.data) ? (row.data as Record<string, Prisma.InputJsonValue>) : {};
  return {
    channel: "mail", key: fallbackKey(row.key), recipientUserId: row.recipientUserId, address,
    template: row.template, locale: row.locale, subject: row.subject, text: row.text, link: row.link,
    data: { ...data, insteadOf: row.id }, status: "pending", lastError: null,
  };
}

/** The failed Teams row's error once its mail is written; cut so the note survives the column's limit. */
export const failedWithMail = (error: string): string => `${error.slice(0, 440)}; ${MAILED_INSTEAD}`;
