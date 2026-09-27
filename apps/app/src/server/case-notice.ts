// Tell the route owner a case was raised: send the email, then note it on the case.
//
// The raise must never depend on this. notifyCaseRaised runs AFTER the event row has committed,
// the caller does not await it, and every failure is a log line. A dead relay cannot break the
// core loop - /admin lists every raise that got no notice and can send it again.
//
// The note is an ordinary case.commented event with the idempotency key notify:<raiseId>, the same
// key the old n8n workflow wrote back with, so /admin pairs a raise with its notice exactly and a
// second attempt finds the first instead of emailing the owner twice.
import { appendEventRow } from "@/lib/db/events";
import { getDb } from "@/lib/db/client";
import { sendMail, mailConfigured } from "@/server/mail";
import {
  composeNoticeMail,
  NOTICE_ACTOR,
  NOTICE_TEXT,
  noticeKey,
  type RaisedNotice,
} from "@/features/cases/notice";

export type Delivery = { ok: true } | { ok: false; error: string };

/**
 * Send one notice and write it onto the case. Returns what happened instead of throwing, so both
 * callers get what they need: the raise path logs it, the admin retry shows it.
 */
export async function deliverRaisedNotice(
  companyId: string,
  notice: RaisedNotice,
  timeoutMs = 4000,
): Promise<Delivery> {
  const mail = composeNoticeMail(notice);
  if (!mail) return { ok: false, error: "This route has no owner with an email address, so there is nobody to write to." };

  const key = noticeKey(notice.eventId);
  const already = await getDb().caseEvent.findFirst({ where: { companyId, idemKey: key }, select: { id: true } });
  if (already) return { ok: true };

  const sent = await sendMail(mail, timeoutMs);
  if (!sent.ok) return sent;

  const noted = await appendEventRow(
    companyId,
    {
      id: "e_" + key.replace(":", "_"),
      day: 0,
      type: "case.commented",
      actor: NOTICE_ACTOR,
      targetId: notice.case.id,
      payload: { text: NOTICE_TEXT },
    },
    { source: "mail", idemKey: key },
  );
  if (!noted.ok) {
    return { ok: false, error: `The owner was emailed, but the note on the case could not be saved: ${noted.error}` };
  }
  return { ok: true };
}

/** Fire and forget. Never throws, never blocks the raise. */
export function notifyCaseRaised(companyId: string, notice: RaisedNotice): void {
  if (!mailConfigured()) return;

  void deliverRaisedNotice(companyId, notice)
    .then((result) => {
      if (!result.ok) console.warn("[notice] case.raised for", notice.slug, "-", result.error);
    })
    .catch((err) => {
      console.warn("[notice] case.raised for", notice.slug, "-", err instanceof Error ? err.message : err);
    });
}

/** Where this company lives, for the links in the message. */
export function companyBaseUrl(slug: string): string {
  const domain = process.env.APP_DOMAIN ?? "localhost";
  const scheme = process.env.PUBLIC_SCHEME ?? "http";
  return process.env.TENANT_MODE === "subdomain"
    ? `${scheme}://${slug}.${domain}`
    : `${scheme}://${domain}/${slug}`;
}
