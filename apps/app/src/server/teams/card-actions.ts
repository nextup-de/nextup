// A person answers or hands over a case from its card in Teams (TMS D12). The submit data is the card's
// (parseSubmit); the person is the active user behind the Entra object id. Everything goes through the
// same checks as the app: mayAppend against the reduced log, then appendEventRow with source 'teams'.
import { actorLabel, meFor } from "@/features/auth/identity";
import type { EventPayload } from "@/features/cases/events";
import { passPayload, routeOfSeat } from "@/features/cases/hand";
import { NOT_NOW_MAX_IN_ROW, PASS_LIMIT, PASS_REASON_MIN, passDueDay, REVISIT_MAX_AHEAD, revisitAllowed } from "@/features/cases/no";
import { mayAppend } from "@/features/cases/permissions";
import { reduce, type ReducedCase, type State } from "@/features/cases/reducer";
import type { Seed } from "@/features/demo/types";
import { DEFAULT_CALENDAR } from "@/features/clock";
import { isWorkday, workdayOf } from "@/features/clock/calendar";
import { seedFor } from "@/features/demo";
import { flagsFor } from "@/features/flags";
import { acceptPayload } from "@/features/projects/accept";
import { confirmCard, decidedAt, parseSubmit, textCard, type Card, type Submit } from "@/features/teams/cards";
import { createT, INTL_LOCALE, type Locale, type MessageKey } from "@/i18n";
import { loadCalendar } from "@/lib/db/calendar";
import { appendEventRow, hasIdemKey, loadLog } from "@/lib/db/events";
import { companyBaseUrl } from "@/server/case-notice";
import { kickJira } from "@/server/jira-sync";
import type { BotActivity, BotCompany, BotPerson } from "./bot";

const refusal = (text: string, locale: Locale): Card => textCard({ subject: "NextUp", text }, locale);

type PassBuilt = { ok: true; payload: EventPayload } | { ok: false; error: MessageKey; params?: Record<string, number>; limit?: boolean };

/**
 * The payload of a hand-over from the card (D13, D22), from fresh state and never from what the card showed: a why of
 * PASS_REASON_MIN characters, the pass limit (a non-manager is stopped; the card has no Send up, so it points to NextUp), the
 * route of the seat it goes to, the answer-date floor of the new desk and, on an asked case, the flag that keeps the question.
 */
export function passFromCard(
  kase: ReducedCase | undefined,
  state: Pick<State, "day">,
  seed: Pick<Seed, "seats" | "routes">,
  role: string,
  submit: Pick<Submit, "toSeatId" | "why">,
): PassBuilt {
  if (!submit.why || submit.why.length < PASS_REASON_MIN) return { ok: false, error: "teams.errorWhyShort", params: { n: PASS_REASON_MIN } };
  if (kase && role !== "manager" && kase.passes >= PASS_LIMIT) return { ok: false, error: "teams.errorPassLimit", params: { n: PASS_LIMIT }, limit: true };
  const toSeatId = submit.toSeatId ?? "";
  const dueDay = kase ? passDueDay(kase, state.day) : null;
  return {
    ok: true,
    payload: passPayload(seed.seats, toSeatId, submit.why, {
      routeId: routeOfSeat(seed.routes, toSeatId)?.id,
      ...(dueDay !== null ? { dueDay } : {}),
      keepsQuestion: kase?.status === "asked",
    }),
  };
}

/**
 * The working-day number of the date a no comes back on (D17), or null when the card's date is no valid day for it: not a
 * working day of the company's calendar (a holiday is not moved to an earlier day), not after today, or more than
 * REVISIT_MAX_AHEAD working days ahead. `today` is the company's day the case state was reduced at; a demo company has no calendar
 * of its own, so its days are counted on the default one.
 */
async function revisitDayOf(company: BotCompany, isoDate: string, today: number, now: Date = new Date()): Promise<number | null> {
  const cal = company.stage === "demo" ? DEFAULT_CALENDAR : await loadCalendar(company.id);
  if (!isWorkday(isoDate, cal)) return null;
  const ahead = workdayOf(new Date(`${isoDate}T12:00:00Z`), cal) - workdayOf(now, cal);
  return ahead >= 1 && ahead <= REVISIT_MAX_AHEAD ? today + ahead : null;
}

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
  // write nothing (K3). mayAppend refuses it too; this names the latest decision of the current cycle: a case that was
  // reopened (a no that came back, a second look) has none until it is decided again, and the card may decide it.
  const kase = state.cases.find((c) => c.id === submit.caseId);
  const latest = kase?.decided ? kase.history.findLast((e) => e.type === "case.decided") : undefined;
  if (latest) return refusal(t("teams.refusedAnswered", { name: latest.actor, time: decidedAt(latest.ts, locale) }), locale);
  const caseLink = `${companyBaseUrl(company.slug)}/cases/${encodeURIComponent(submit.caseId)}`;
  // A refusal that sends the person to the case in NextUp (the pass limit, a not-now that is used up).
  const refusedOpen = (reason: string) => textCard({ subject: "NextUp", text: t("teams.refused", { reason }), link: caseLink }, locale);

  let type: "case.decided" | "case.asked" | "case.handed" | "case.answered";
  let payload: EventPayload;
  let outcome: "yes" | "no" | "ask" | "handed" | "replied";
  let draftId: string | null = null;
  if (submit.kind === "reply") {
    // The answer to the desk's question, from the question's card: the same event the case page writes (case.answered).
    type = "case.answered";
    payload = { text: submit.text ?? "" };
    outcome = "replied";
  } else if (submit.kind === "answer") {
    if (submit.answer === "yes") {
      type = "case.decided";
      // With projects on, a yes opens a draft like the app's: the person answering is the decider and sets it up (D19).
      if (kase && (await flagsFor(company.slug)).projects) {
        payload = acceptPayload({ caseTitle: kase.title, decider: { userId: person.id, name: person.name } });
        draftId = payload.projectId as string;
      } else payload = { answer: "yes" };
      outcome = "yes";
    } else if (submit.answer === "no") {
      // The card refuses a no that the server would (D17, D22) before anything is written, so it does not depend on the server's checks.
      const category = submit.category;
      if (!category) return refused(t("teams.errorNoCategory"));
      const min = state.rules.noReasonMin;
      if (!submit.text || submit.text.length < min) return refused(t("teams.errorReasonShort", { n: min }));
      if (category === "not-now" && kase && kase.notNowInRow >= NOT_NOW_MAX_IN_ROW) return refusedOpen(t("teams.errorNotNowLimit"));
      let revisitDay: number | undefined;
      if (submit.revisitDay) {
        if (!revisitAllowed(category)) return refused(t("teams.errorRevisitNotAllowed"));
        const day = await revisitDayOf(company, submit.revisitDay, state.day);
        if (day === null) return refused(t("teams.errorRevisitDay", { max: REVISIT_MAX_AHEAD }));
        revisitDay = day;
      } else if (category === "not-now") return refused(t("teams.errorNoRevisit"));
      type = "case.decided";
      payload = { answer: "no", category, reason: submit.text, ...(submit.changeIf ? { changeIf: submit.changeIf } : {}), ...(revisitDay !== undefined ? { revisitDay } : {}) };
      outcome = "no";
    } else {
      if (!submit.text) return refused(t("teams.errorNoQuestion"));
      type = "case.asked";
      payload = { text: submit.text };
      outcome = "ask";
    }
  } else {
    // A hand-over is a pass (D13): the card stamps what the app stamps, from the state it just reduced.
    const pass = passFromCard(kase, state, seed, who.role, submit);
    if (!pass.ok) return pass.limit ? refusedOpen(t(pass.error, pass.params)) : refused(t(pass.error, pass.params));
    type = "case.handed";
    payload = pass.payload;
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
      link: caseLink,
      sandbox: company.stage === "sandbox",
    },
    locale,
  );
}
