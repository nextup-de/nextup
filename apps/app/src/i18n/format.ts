// Dates, numbers, euros and counts per locale. Pure. Times are shown in Europe/Berlin.
import { INTL_LOCALE, translate, type Locale, type MessageKey } from "./index";

export type DateStyle = "day" | "dayMonth" | "full" | "weekday" | "time" | "dateTime";

const TZ = "Europe/Berlin";
export const DATE_OPTIONS: Record<DateStyle, Intl.DateTimeFormatOptions> = {
  day: { day: "numeric", month: "short", year: "numeric", timeZone: TZ },
  dayMonth: { day: "numeric", month: "short", timeZone: TZ },
  full: { day: "numeric", month: "long", year: "numeric", timeZone: TZ },
  weekday: { weekday: "long", timeZone: TZ },
  time: { hour: "2-digit", minute: "2-digit", timeZone: TZ },
  dateTime: { day: "numeric", month: "short", hour: "2-digit", minute: "2-digit", timeZone: TZ },
};

export function formatDate(locale: Locale, date: Date | string, style: DateStyle): string {
  return new Intl.DateTimeFormat(INTL_LOCALE[locale], DATE_OPTIONS[style]).format(typeof date === "string" ? new Date(date) : date);
}

export const formatNumber = (locale: Locale, n: number): string => new Intl.NumberFormat(INTL_LOCALE[locale]).format(n);

export function formatEuro(locale: Locale, n: number): string {
  if (locale === "en") return "€" + formatNumber(locale, n);
  return new Intl.NumberFormat(INTL_LOCALE[locale], { style: "currency", currency: "EUR", minimumFractionDigits: 0 }).format(n);
}

/** "1 day" / "3 days", "1 Tag" / "3 Tage". */
export const days = (locale: Locale, n: number): string => translate(locale, "common.days", { count: n });

/** "1 team" / "3 teams": the count, then the word in its singular or plural key. */
export function plural(locale: Locale, n: number, oneKey: MessageKey, otherKey: MessageKey): string {
  const one = new Intl.PluralRules(INTL_LOCALE[locale]).select(n) === "one";
  return `${formatNumber(locale, n)} ${translate(locale, one ? oneKey : otherKey)}`;
}
