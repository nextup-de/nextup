// The weekly pilot report mail (PIL D12). Pure: a week's report and the calendar in, a draft or a due week out.
// The mail holds the four numbers with their baseline and a count of units shown and hidden; never a unit
// number (D3). The server side (server/notify/pilot-report.ts) decides who and writes the rows.
import type { CalendarSpec } from "@/features/clock";
import { berlinDate, isWorkday } from "@/features/clock/calendar";
import type { PilotMetric, PilotMetricKey, PilotReport } from "@/features/metrics/types";
import { addDays, isoWeekNumber, mondayOf, type PilotWeek } from "@/features/pilot/weeks";
import { formatDate, formatNumber } from "@/i18n/format";
import { createT, type Locale, type MessageKey } from "@/i18n";
import type { OutboxDraft } from "@/lib/db/outbox";

export const PILOT_REPORT_TEMPLATE = "pilot.report";

/** `2026-W46`: the ISO year of the week's Thursday and the week number. */
export const isoWeekLabel = (monday: string): string =>
  `${addDays(monday, 3).slice(0, 4)}-W${String(isoWeekNumber(monday)).padStart(2, "0")}`;

/** The key of one person's mail for one report week: a second run writes nothing new. */
export const pilotReportKey = (monday: string, userId: string): string => `pilot:${isoWeekLabel(monday)}:${userId}`;

const berlinHour = (now: Date): number =>
  Number(new Intl.DateTimeFormat("en-GB", { timeZone: "Europe/Berlin", hour: "2-digit", hourCycle: "h23" }).format(now));

/**
 * The Monday of the week to report on, or null when the mail is not due. Due from `fromHour` (Europe/Berlin) on
 * the first working day of an ISO week: the week before is the one reported.
 */
export function pilotReportDue(now: Date, cal: CalendarSpec, fromHour: number): string | null {
  if (berlinHour(now) < fromHour) return null;
  const today = berlinDate(now);
  if (!isWorkday(today, cal)) return null;
  const monday = mondayOf(today);
  for (let d = monday; d < today; d = addDays(d, 1)) if (isWorkday(d, cal)) return null;
  return addDays(monday, -7);
}

const TILES = [
  ["casesPer10", "mailCases"],
  ["firstReasonedAnswer", "mailFirstAnswer"],
  ["withinPromisePct", "mailOnTime"],
  ["participationPct", "mailUsing"],
] as const satisfies readonly (readonly [PilotMetricKey, string])[];

export type PilotReportMailInput = {
  userId: string;
  company: string;
  week: PilotWeek;
  report: PilotReport;
  locale: Locale;
  baseUrl: string;
};

/** The mail of one person for one report week. The address is the runner's to fill in. */
export function pilotReportDraft(i: PilotReportMailInput): OutboxDraft {
  const t = createT(i.locale);
  const key = (k: string) => `settingsPilotReport.${k}` as MessageKey;
  const n = (v: number) => formatNumber(i.locale, v);
  const value = (k: PilotMetricKey, m: PilotMetric | undefined): string => {
    if (!m) return "–";
    if (m.hidden) return t(key("tooFewToShow"));
    if (m.value === null) return "–";
    if (k === "firstReasonedAnswer") return t(key("unitWorkingDays"), { n: n(m.value) });
    return k === "casesPer10" ? n(m.value) : `${n(m.value)} %`;
  };
  const baseline = (k: PilotMetricKey, m: PilotMetric | undefined): string => {
    if (!m || m.baseline === null || !i.report.baseline) return "–";
    if (k === "firstReasonedAnswer") return t(key("unitWorkingDays"), { n: n(m.baseline) });
    return k === "casesPer10" ? n(m.baseline) : `${n(m.baseline)} %`;
  };
  const lines = TILES.map(([k, label]) => {
    const m = i.report.metrics.find((x) => x.key === k);
    return `${t(key(label))}: ${value(k, m)} (${t(key("mailBaseline"))}: ${baseline(k, m)})`;
  });
  const shown = i.report.zi.units.filter((u) => !u.hidden).length;
  const hidden = i.report.zi.units.length - shown;
  const page = `${i.baseUrl}/settings/pilot-report`;
  return {
    channel: "mail", key: pilotReportKey(i.week.monday, i.userId), recipientUserId: i.userId, address: null,
    template: PILOT_REPORT_TEMPLATE, locale: i.locale,
    subject: t(key("mailSubject"), { week: i.week.week, company: i.company }),
    text: [
      t(key("mailLead"), { week: i.week.week, from: formatDate(i.locale, i.week.monday, "dayMonth"), to: formatDate(i.locale, i.week.sunday, "day"), n: i.week.pilotWeek }),
      "",
      ...lines,
      "",
      t(key("mailUnits"), { shown, hidden }),
      "",
      `${t(key("mailButton"))}: ${page}`,
      "",
      t(key("mailFoot"), { company: i.company }),
      `${t(key("mailStop"))} ${page}`,
    ].join("\n"),
    link: page,
    data: { week: isoWeekLabel(i.week.monday), pilotWeek: i.week.pilotWeek, unitsShown: shown, unitsHidden: hidden },
    status: "pending", lastError: null,
  };
}
