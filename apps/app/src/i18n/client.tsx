"use client";

import { createContext, useContext, useMemo } from "react";
import { formatDate, formatEuro, formatNumber, days, plural, type DateStyle } from "./format";
import { createT, DEFAULT_LOCALE, type Locale, type MessageKey, type T } from "./index";

const LocaleContext = createContext<Locale>(DEFAULT_LOCALE);

export function I18nProvider({ locale, children }: { locale: Locale; children: React.ReactNode }) {
  return <LocaleContext.Provider value={locale}>{children}</LocaleContext.Provider>;
}

export const useLocale = (): Locale => useContext(LocaleContext);

export function useT(): T {
  const locale = useLocale();
  return useMemo(() => createT(locale), [locale]);
}

/** The functions of format.ts, bound to the locale. */
export function useFormat() {
  const locale = useLocale();
  return useMemo(
    () => ({
      date: (date: Date | string, style: DateStyle) => formatDate(locale, date, style),
      number: (n: number) => formatNumber(locale, n),
      euro: (n: number) => formatEuro(locale, n),
      days: (n: number) => days(locale, n),
      plural: (n: number, oneKey: MessageKey, otherKey: MessageKey) => plural(locale, n, oneKey, otherKey),
    }),
    [locale],
  );
}
