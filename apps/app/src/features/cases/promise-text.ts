// The sentences of the answer promise and the routing trail (LOOP-C1, spec 11 'Answer date and deputy
// status', spec 04 'Case page'). Pure: facts in, text out through the catalog. Role first, person second.
import type { T } from "@/i18n";
import type { AnswerPromise } from "./promise";
import type { RoutingRow } from "./routing-trail";

export type PromiseNames = {
  holderRole: string; // the title of the role that holds the case now
  holderPeople: string[]; // the people in the holder seat, shown, never compared
  escalatedRole: string | null; // the deputy role told while the owner keeps the case
  date: (day: number) => string; // workday -> "Fri 14 Nov"; only used in workdays mode
  today?: number; // the working day now, for "n working days left"
};

export type PromiseText = { answerBy: string; with: string; note: string | null };

// A day as a date, or as "day n" when the company runs the demo clock (no calendar date).
const dayText = (p: AnswerPromise, names: PromiseNames, t: T, day: number): string =>
  p.dueDate === null ? t("loopCase.demoDay", { n: day }) : names.date(day);

function dueText(p: AnswerPromise, names: PromiseNames, t: T): string {
  return p.dueDate === null ? t("loopCase.demoDue", { n: p.dueDay }) : names.date(p.dueDay);
}

function answerByText(p: AnswerPromise, names: PromiseNames, t: T): string {
  const date = dueText(p, names, t);
  switch (p.state) {
    case "waiting":
      return p.dueDate !== null && names.today !== undefined
        ? t("loopCase.answerWaiting", { date, count: Math.max(0, p.dueDay - names.today) })
        : date;
    case "due-today": return t("loopCase.answerDueToday");
    case "late": return t("loopCase.answerLate", { date, since: dayText(p, names, t, p.dueDay + 1) });
    case "answered-on-time": return t("loopCase.answerOnTime", { date: dayText(p, names, t, p.answeredDay ?? p.dueDay) });
    case "answered-late": return t("loopCase.answerAfter", { date: dayText(p, names, t, p.answeredDay ?? p.dueDay) });
  }
}

const roleOrNone = (role: string, t: T): string => role || t("loopCase.noRole");

export function promiseText(p: AnswerPromise, names: PromiseNames, t: T): PromiseText {
  const role = roleOrNone(names.holderRole, t);
  const people = names.holderPeople.filter(Boolean);
  const withText = people.length ? t("loopCase.holder", { role, people: people.join(", ") }) : t("loopCase.holderVacant", { role });
  let note: string | null = null;
  if (p.holder === "deputy" && p.handedDay !== null) note = t("loopCase.handedNote", { date: dayText(p, names, t, p.handedDay) });
  else if (p.holder === "owner" && p.escalatedRoleId !== null) note = t("loopCase.flagNote", { date: dayText(p, names, t, p.dueDay + 1), role });
  return { answerBy: answerByText(p, names, t), with: withText, note };
}

/** My cases: "They owe you an answer by {date}" - or what happened to it - without the note. */
export function owedLine(p: AnswerPromise, names: PromiseNames, t: T): string {
  if (p.answeredDay !== null) return t("loopCase.owedAnswered", { date: dayText(p, names, t, p.answeredDay) });
  if (p.state === "due-today") return t("loopCase.owedByToday");
  return t("loopCase.owedBy", { date: dueText(p, names, t) });
}

export type RoutingNames = {
  roleOfRoute: (routeId: string | null) => string; // the title of the route's owner role, "" when unknown
  date: (day: number) => string;
};

export function routingText(rows: readonly RoutingRow[], names: RoutingNames, t: T): string[] {
  const role = (id: string | null) => roleOrNone(names.roleOfRoute(id), t);
  const source = (s: "llm" | "keywords") => t(s === "llm" ? "loopCase.byAi" : "loopCase.byKeywords");
  return rows.map((r) => {
    switch (r.kind) {
      case "proposed": return t("loopCase.routeProposed", { role: role(r.routeId), source: source(r.source) });
      case "sent": return t("loopCase.routeSent", { role: role(r.routeId), by: t(r.chosenBy === "raiser" ? "loopCase.byRaiser" : "loopCase.byProposal") });
      case "proposed-sent": return t("loopCase.routeProposedSent", { role: role(r.routeId), source: source(r.source) });
      case "moved": return t("loopCase.routeMoved", { role: role(r.routeId), date: names.date(r.day) });
    }
  });
}
