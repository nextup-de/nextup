// The raise notice's resend. Every message now comes from the outbox (plan NTF): the dispatcher plans the
// `raised` row for each raise (server/notify/dispatch.ts) and the delivery sends it, and the mail channel notes it
// on the case with idempotency key notify:<raiseId> (server/notify/channels/mail.ts). This file is what /admin's
// "send again" uses: it finds or writes the row for that raise, sends it, and says what came back.
import { companyUrl } from "@/features/tenant/urls";
import { getDb } from "@/lib/db/client";
import { enqueue } from "@/lib/db/outbox";
import { composeNoticeMail, noticeKey, type RaisedNotice } from "@/features/cases/notice";
import { translate } from "@/i18n";
import { localeForEmail } from "@/i18n/server";
import { MAIL_WAITING } from "@/server/notify/channels/mail";
import { deliverOnce } from "@/server/notify/deliver";

export type Delivery = { ok: true } | { ok: false; error: string };

/**
 * Send one notice and write it onto the case. Returns what happened instead of throwing, so the admin retry
 * shows it. The raise's `raised` row (key notify:<eventId>) is found or written, made due, and delivered once.
 * A row already sent is the answer: the owner is not mailed twice.
 */
export async function deliverRaisedNotice(
  companyId: string,
  notice: RaisedNotice,
  // eslint-disable-next-line @typescript-eslint/no-unused-vars -- kept for the callers; the channel owns its timeout
  _timeoutMs = 4000,
): Promise<Delivery> {
  const db = getDb();
  const key = noticeKey(notice.eventId);
  const find = () => db.outboxMessage.findFirst({ where: { companyId, key } });
  let row = await find();
  if (row?.status === "sent") return { ok: true };

  if (!row) {
    // The owner's language; what /admin shows stays English.
    const email = notice.route.ownerEmail;
    const locale = email ? await localeForEmail(companyId, email) : undefined;
    const mail = composeNoticeMail(notice, locale);
    if (!mail || !email) return { ok: false, error: translate("en", "mail.noticeNoOwner") };
    const user = await db.user.findFirst({ where: { companyId, email: { equals: email.trim(), mode: "insensitive" } }, select: { id: true } });
    await enqueue(companyId, [{
      channel: "mail", key, recipientUserId: user?.id ?? null, address: email, template: "raised", locale: locale ?? "en",
      subject: mail.subject, text: mail.text, link: notice.links.case, status: "pending", lastError: null,
      data: { eventId: notice.eventId, caseId: notice.case.id },
    }]);
    row = await find();
  }
  if (!row) return { ok: false, error: translate("en", "mail.noticeNoteNotSaved", { error: "the message was not saved" }) };

  // A person pressed "send again": make the row due now, whatever the gate or an earlier failure said.
  const now = new Date();
  await db.outboxMessage.updateMany({ where: { id: row.id, status: { not: "sent" } }, data: { status: "pending", attempt: 0, nextAt: now, lastError: null } });
  await deliverOnce(now);

  const after = await db.outboxMessage.findUnique({ where: { id: row.id }, select: { status: true, lastError: true } });
  if (after?.status === "sent") return { ok: true };
  return { ok: false, error: after?.lastError ?? MAIL_WAITING };
}

/** Where this company lives, for the links in the message. */
export function companyBaseUrl(slug: string): string {
  return companyUrl(slug);
}
