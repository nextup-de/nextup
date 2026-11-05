// What the setup finish page says about rules and calendar. Pure: the saved values in, plain values
// out. A value that still equals the default is marked as one.
import { DEFAULT_CALENDAR, type CalendarSpec } from "@/features/clock";
import { DEFAULT_RULES, type CompanyRules } from "@/features/knowledge/rules";

export type SetupDoneFacts = {
  promiseDays: number;
  rulesDefault: boolean;
  region: string;
  workdays: number[];
  calendarDefault: boolean;
  /** The IT console's address, for a person who may open it. */
  consoleHref: string | null;
};

export function setupDoneFacts(rules: CompanyRules, calendar: CalendarSpec, consoleHref: string | null): SetupDoneFacts {
  return {
    promiseDays: rules.promiseDays,
    rulesDefault: rules.promiseDays === DEFAULT_RULES.promiseDays,
    region: calendar.region,
    workdays: calendar.workdays,
    calendarDefault: calendar.region === DEFAULT_CALENDAR.region && calendar.workdays.join() === DEFAULT_CALENDAR.workdays.join(),
    consoleHref,
  };
}

/** Weekdays 1 (Monday) to 7 (Sunday) as a short range: "Mon-Fri", or a list when they have gaps. */
export function workdayRange(days: readonly number[], locale: string): string {
  const name = (d: number) => new Intl.DateTimeFormat(locale, { weekday: "short", timeZone: "UTC" }).format(new Date(Date.UTC(2024, 0, d)));
  const sorted = [...days].sort((a, b) => a - b);
  const first = sorted[0];
  const last = sorted[sorted.length - 1];
  if (first === undefined || last === undefined) return "";
  const joined = last - first === sorted.length - 1 && sorted.length > 1;
  return joined ? `${name(first)}-${name(last)}` : sorted.map(name).join(", ");
}
