// The `teams` channel (TMS D10): a notice as a card in the recipient's chat with the bot. It finds the person's
// conversation, builds the card for the template (D11) in the message's locale and sends it (D8). For template
// `raised` it then notes the notice on the case, as the mail channel does, with source 'teams'.
import { PUBLIC_CONTRACT_VERSION, type NotifyChannel, type NotifyMessage, type NotifyResult } from "@nextup/contracts/public";
import { meFor } from "@/features/auth/identity";
import { NOTICE_ACTOR, noticeKey, noticeText } from "@/features/cases/notice";
import { reduce, type State } from "@/features/cases/reducer";
import type { EventPayload } from "@/features/cases/events";
import { attachment, loopCard, loopCardKind, loopRights, NO_LOOP_RIGHTS, raisedCard, reminderCard, textCard, type Card, type CardInput, type LoopCardKind } from "@/features/teams/cards";
import { teamsApp } from "@/features/teams/config";
import { companySeed } from "@/lib/db/companies";
import { getDb } from "@/lib/db/client";
import { appendEventRow, loadLog } from "@/lib/db/events";
import { conversationOf } from "@/lib/db/teams";
import { companyBaseUrl } from "@/server/case-notice";
import { retryableStatus, sendActivity } from "./connector";

const str = (v: unknown): string | null => (typeof v === "string" && v ? v : null);
const fail = (error: string, retryable: boolean): NotifyResult => ({ ok: false, error: error.slice(0, 500), retryable });

/** The state after the company's log: the case's kind and the seats a case can be handed to. */
async function stateOf(companyId: string): Promise<State | null> {
  const company = await getDb().company.findUnique({ where: { id: companyId }, select: { id: true, seedJson: true, stage: true } });
  if (!company) return null;
  return reduce(await companySeed(company), await loadLog(companyId));
}

/**
 * A loop notice as a card (REM-T1): the case's or project's title, the reason from the event the notice is about, a link to it, and the buttons this receiver may
 * use, asked of mayAppend against the state as it is now. Null when the notice's case, project or event cannot be found: the caller sends the text card.
 */
async function loopCardFor(message: NotifyMessage, kind: LoopCardKind): Promise<Card | null> {
  const subjectId = str(message.data.subjectId) ?? str(message.data.caseId);
  const eventId = str(message.data.eventId);
  const userId = message.recipient.userId;
  if (!subjectId || !eventId || !userId) return null;
  const db = getDb();
  const company = await db.company.findUnique({ where: { id: message.companyId }, select: { id: true, slug: true, seedJson: true, stage: true } });
  const person = await db.user.findFirst({ where: { id: userId, companyId: message.companyId }, select: { role: true, name: true, handle: true } });
  if (!company || !person) return null;
  const log = await loadLog(message.companyId);
  const state = reduce(await companySeed(company), log);
  const ev = log.events.find((e) => e.id === eventId);
  if (!ev) return null;
  const pl: EventPayload = ev.payload;
  const base = companyBaseUrl(company.slug);
  const mine = meFor(userId, state.seats);

  if (kind === "step") {
    const project = state.projects.find((p) => p.id === subjectId);
    const ask = project?.helpAsks.find((a) => a.id === eventId) ?? project?.helpAsks.findLast((a) => a.stepId === pl.stepId);
    if (!project || !ask) return null;
    const step = project.steps.find((s) => s.id === ask.stepId)?.text;
    return loopCard({ loop: kind, title: project.title, reasonText: ask.text, step, link: `${base}/projects/${encodeURIComponent(project.id)}` }, NO_LOOP_RIGHTS, message.locale);
  }

  const kase = state.cases.find((c) => c.id === subjectId);
  if (!kase) return null;
  const who = { role: person.role as "manager" | "leader" | "member", userId, me: mine, name: person.name, handle: person.handle };
  const reason = kind === "passed" ? pl.why : kind === "asked" ? pl.text : pl.answer === "no" ? pl.reason : pl.note;
  return loopCard(
    {
      loop: kind, decision: pl.answer === "no" ? "no" : "yes", title: kase.title, reasonText: reason ?? undefined, link: `${base}/cases/${encodeURIComponent(kase.id)}`,
      caseId: kase.id, cardId: message.id, kind: kase.kind, noReasonMin: state.rules.noReasonMin,
      seats: state.seats.filter((s) => !mine.roleIds.includes(s.roleId)).map((s) => ({ id: s.id, label: s.label })),
    },
    kind === "decided" ? NO_LOOP_RIGHTS : loopRights(who, kase.id, state),
    message.locale,
  );
}

async function cardFor(message: NotifyMessage): Promise<Card> {
  const base: CardInput = { title: undefined, link: message.link ?? undefined, subject: message.subject, text: message.text };
  const loop = loopCardKind(message.template);
  if (loop) return (await loopCardFor(message, loop)) ?? textCard(base, message.locale);
  const caseId = str(message.data.caseId) ?? str(message.data.subjectId);
  const isRaised = message.template === "raised";
  const isDeadline = message.template === "reminder.deadline";
  if (!(isRaised || isDeadline) || !caseId) return textCard(base, message.locale);

  const state = await stateOf(message.companyId);
  const kase = state?.cases.find((c) => c.id === caseId);
  if (!state || !kase) return textCard(base, message.locale);

  const mine = meFor(message.recipient.userId || null, state.seats);
  const input: CardInput = {
    ...base,
    caseId,
    cardId: message.id,
    title: kase.title,
    body: kase.body,
    kind: kase.kind,
    fromUnit: kase.fromDept || kase.from,
    routeLabel: kase.route?.type,
    seats: state.seats.filter((s) => !mine.roleIds.includes(s.roleId)).map((s) => ({ id: s.id, label: s.label })),
    noReasonMin: state.rules.noReasonMin,
  };
  if (isRaised) return raisedCard(input, message.locale);
  const escalated = kase.escalated;
  const toYou = !!escalated?.toSeatId && mine.seatIds.includes(escalated.toSeatId);
  return reminderCard(
    { ...input, variant: toYou ? "escalation" : "desk", role: toYou ? escalated?.from : escalated?.to, daysLate: Math.max(0, state.day - kase.dueDay) },
    message.locale,
  );
}

export const teamsChannel: NotifyChannel = {
  info: { kind: "NotifyChannel", id: "teams", contractVersion: PUBLIC_CONTRACT_VERSION },

  async send(message: NotifyMessage): Promise<NotifyResult> {
    const app = teamsApp();
    if (!app) return fail("Teams is not set up", false);
    const userId = message.recipient.userId;
    const conversation = userId ? await conversationOf(message.companyId, userId) : null;
    if (!conversation) return fail("no Teams chat", false);

    let sent: { status: number; id: string | null };
    try {
      const card = await cardFor(message);
      sent = await sendActivity(app, conversation.serviceUrl, conversation.conversationId, { type: "message", attachments: [attachment(card)] });
    } catch (e) {
      return fail(e instanceof Error ? e.message : String(e), true);
    }
    if (sent.status < 200 || sent.status >= 300) return fail(`Teams answered ${sent.status}`, retryableStatus(sent.status));

    if (message.template === "raised") {
      const eventId = str(message.data.eventId);
      const caseId = str(message.data.caseId);
      if (eventId && caseId) {
        const key = noticeKey(eventId);
        const noted = await appendEventRow(
          message.companyId,
          { id: "e_" + key.replace(":", "_"), day: 0, type: "case.commented", actor: NOTICE_ACTOR, targetId: caseId, payload: { text: noticeText(message.locale), channel: "teams" } },
          { source: "teams", idemKey: key },
        );
        // The card is out; a failed note must not send it again.
        if (!noted.ok) console.warn("[notify] teams", message.id, "sent, but the note on the case was not saved:", noted.error);
      }
    }
    return { ok: true, providerMessageId: sent.id };
  },
};
