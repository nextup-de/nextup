// A person answers or hands over a case from its card in Teams (TMS D12). The submit data is the card's
// (parseSubmit); the person is the active user behind the Entra object id. Everything goes through the
// same checks as the app: mayAppend against the reduced log, then appendEventRow with source 'teams'.
import { actorLabel, meFor } from "@/features/auth/identity";
import type { EventPayload } from "@/features/cases/events";
import { handPayload } from "@/features/cases/hand";
import { mayAppend } from "@/features/cases/permissions";
import { reduce } from "@/features/cases/reducer";
import { seedFor } from "@/features/demo";
import { flagsFor } from "@/features/flags";
import { acceptPayload } from "@/features/projects/accept";
import { confirmCard, decidedAt, parseSubmit, textCard, type Card } from "@/features/teams/cards";
import { createT, INTL_LOCALE, type Locale } from "@/i18n";
import { appendEventRow, hasIdemKey, loadLog } from "@/lib/db/events";
import { companyBaseUrl } from "@/server/case-notice";
import { kickJira } from "@/server/jira-sync";
import type { BotActivity, BotCompany, BotPerson } from "./bot";

const refusal = (text: string, locale: Locale): Card => textCard({ subject: "NextUp", text }, locale);

/**
 * The card to answer with, or null when this activity was already handled (Teams repeats activities;
 * the idempotency key `teams:<activity id>` makes the second one a no-op).
 */
export async function handleSubmit(company: BotCompany, person: BotPerson, activity: BotActivity, locale: Locale): Promise<Card | null> {
  const t = createT(locale);
  const refused = (reason: string) => refusal(t("teams.refused", { reason }), locale);
  const submit = parseSubmit(activity.value);
  if (!submit) return refused(t("cases.actionBadEvent"));

  const idemKey = activity.id ? `teams:${activity.id}` : null;
  if (idemKey && (await hasIdemKey(company.id, idemKey))) return null;

  const seed = await seedFor(company.slug);
  const state = reduce(seed, await loadLog(company.id));
  const who = {
    role: person.role as "manager" | "leader" | "member",
    userId: person.id,
    me: meFor(person.id, seed.seats),
    name: person.name,
    handle: person.handle,
  };

  // The card stays in the chat after the case is decided elsewhere (the app, another card): say who answered and
  // write nothing (K3). mayAppend refuses it too; this names the first decision.
  const kase = state.cases.find((c) => c.id === submit.caseId);
  const first = kase?.decided ? kase.history.find((e) => e.type === "case.decided") : undefined;
  if (first) return refusal(t("teams.refusedAnswered", { name: first.actor, time: decidedAt(first.ts, locale) }), locale);

  let type: "case.decided" | "case.asked" | "case.handed";
  let payload: EventPayload;
  let outcome: "yes" | "no" | "ask" | "handed";
  let draftId: string | null = null;
  if (submit.kind === "answer") {
    if (submit.answer === "yes") {
      type = "case.decided";
      // With projects on, a yes opens a draft like the app's: the person answering is the decider and sets it up (D19).
      if (kase && (await flagsFor(company.slug)).projects) {
        payload = acceptPayload({ caseTitle: kase.title, decider: { userId: person.id, name: person.name } });
        draftId = payload.projectId as string;
      } else payload = { answer: "yes" };
      outcome = "yes";
    } else if (submit.answer === "no") {
      if (!submit.text) return refused(t("teams.errorNoText"));
      type = "case.decided";
      payload = { answer: "no", reason: submit.text };
      outcome = "no";
    } else {
      if (!submit.text) return refused(t("teams.errorNoQuestion"));
      type = "case.asked";
      payload = { text: submit.text };
      outcome = "ask";
    }
  } else {
    type = "case.handed";
    payload = handPayload(seed.seats, submit.toSeatId ?? "", submit.why);
    outcome = "handed";
  }

  const verdict = mayAppend(who, { type, target: submit.caseId, payload }, state, locale);
  if (!verdict.ok) return refused(verdict.error);

  const result = await appendEventRow(
    company.id,
    { id: crypto.randomUUID(), day: 0, type, actor: actorLabel(who), targetId: submit.caseId, payload },
    { actorUserId: person.id, source: "teams", idemKey },
  );
  if (!result.ok) return refused(result.error);
  if (result.duplicate) return null;
  if (type === "case.decided") kickJira(company.slug);

  const time = new Intl.DateTimeFormat(INTL_LOCALE[locale], { hour: "2-digit", minute: "2-digit" }).format(new Date());
  // The yes opened a draft: the card says so and leads to it.
  if (draftId) {
    return textCard({ subject: "NextUp", title: kase?.title ?? "", text: t("teams.draftOpened", { time }), link: `${companyBaseUrl(company.slug)}/projects/${encodeURIComponent(draftId)}` }, locale);
  }

  return confirmCard(
    {
      outcome,
      title: kase?.title ?? "",
      role: outcome === "handed" ? payload.to : undefined,
      time,
      link: `${companyBaseUrl(company.slug)}/cases/${submit.caseId}`,
      sandbox: company.stage === "sandbox",
    },
    locale,
  );
}
