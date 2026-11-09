// The `mail` channel: server/mail.ts sendMail behind NotifyChannel. For template `raised` it then notes the mail on
// the case, as server/case-notice.ts does, with idemKey notify:<eventId>. The planner puts `eventId` and `caseId`
// into the row's data for that template.
import { PUBLIC_CONTRACT_VERSION, type NotifyChannel, type NotifyMessage, type NotifyResult } from "@nextup/contracts/public";
import { NOTICE_ACTOR, noticeKey, noticeText } from "@/features/cases/notice";
import { appendEventRow } from "@/lib/db/events";
import { mailConfigured, sendMail } from "@/server/mail";

/** The error text of "no relay configured": the row waits instead of counting a failed try (deliver.ts). */
export const MAIL_WAITING = "SMTP_URL is not set";

const str = (v: unknown): string | null => (typeof v === "string" && v ? v : null);

export const mailChannel: NotifyChannel = {
  info: { kind: "NotifyChannel", id: "mail", contractVersion: PUBLIC_CONTRACT_VERSION },

  async send(message: NotifyMessage): Promise<NotifyResult> {
    if (!mailConfigured()) return { ok: false, error: MAIL_WAITING, retryable: true };
    const to = message.recipient.address;
    if (!to) return { ok: false, error: "the message has no address", retryable: false };

    // The link once: most templates already name it in their text ("Open the case: ..."), so it is only added when missing.
    const text = message.link && !message.text.includes(message.link) ? `${message.text}\n\n${message.link}` : message.text;
    const sent = await sendMail({ to, subject: message.subject, text });
    // A hard bounce is failed at once (deliver.ts); anything else follows the retry ladder.
    if (!sent.ok) return { ok: false, error: sent.error.slice(0, 500), retryable: !sent.permanent };

    if (message.template === "raised") {
      const eventId = str(message.data.eventId);
      const caseId = str(message.data.caseId);
      if (eventId && caseId) {
        const key = noticeKey(eventId);
        const noted = await appendEventRow(
          message.companyId,
          {
            id: "e_" + key.replace(":", "_"),
            day: 0,
            type: "case.commented",
            actor: NOTICE_ACTOR,
            targetId: caseId,
            payload: { text: noticeText(message.locale), channel: "mail" },
          },
          { source: "mail", idemKey: key },
        );
        // The mail is out; a failed note must not send it again, so it is a success with the problem logged.
        if (!noted.ok) console.warn("[notify] mail", message.id, "sent, but the note on the case was not saved:", noted.error);
      }
    }
    return { ok: true, providerMessageId: null };
  },
};
