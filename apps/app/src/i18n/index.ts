// The client-safe half of the catalog: no next/*, no node:*, no database. server.ts and client.tsx build on it.
import { de } from "./de";
import { en } from "./en";

export { defineMessages } from "./define";

export const LOCALES = ["de", "en"] as const;
export type Locale = (typeof LOCALES)[number];
export const DEFAULT_LOCALE: Locale = "en";
export const LOCALE_COOKIE = "nextup_locale";
export const INTL_LOCALE: Record<Locale, string> = { de: "de-DE", en: "en-GB" };

export function isLocale(x: unknown): x is Locale {
  return typeof x === "string" && (LOCALES as readonly string[]).includes(x);
}

type Catalog = typeof en;
type Base<K> = K extends `${infer B}_one` ? B : K extends `${infer B}_other` ? B : K;
/** Every `<ns>.<key>`; a plural pair `k_one` / `k_other` is listed once as `k`. */
export type MessageKey = { [N in keyof Catalog]: `${N & string}.${Base<keyof Catalog[N] & string>}` }[keyof Catalog];

type Params = Record<string, string | number>;
const CATALOGS: Record<Locale, Record<string, Record<string, string>>> = { de, en };

function lookup(locale: Locale, ns: string, key: string): string | undefined {
  return CATALOGS[locale][ns]?.[key] ?? (locale === DEFAULT_LOCALE ? undefined : CATALOGS[DEFAULT_LOCALE][ns]?.[key]);
}

export function translate(locale: Locale, key: MessageKey, params?: Params): string {
  const dot = key.indexOf(".");
  const ns = key.slice(0, dot);
  const name = key.slice(dot + 1);
  let text: string | undefined;
  if (typeof params?.count === "number") {
    const form = new Intl.PluralRules(INTL_LOCALE[locale]).select(params.count) === "one" ? "one" : "other";
    text = lookup(locale, ns, `${name}_${form}`);
  }
  text ??= lookup(locale, ns, name);
  if (text === undefined) return key;
  const values = params;
  return values ? text.replace(/\{(\w+)\}/g, (whole, p: string) => (p in values ? String(values[p]) : whole)) : text;
}

export type T = (key: MessageKey, params?: Params) => string;
export const createT = (locale: Locale): T => (key, params) => translate(locale, key, params);

/** A request: cookie, then the person's own choice, then the company's default, then English. */
export function resolveLocale(input: { cookie?: string | null; userLocale?: string | null; companyLocale?: string | null }): Locale {
  for (const v of [input.cookie, input.userLocale, input.companyLocale]) if (isLocale(v)) return v;
  return DEFAULT_LOCALE;
}

/** A mail: the recipient's own choice, then the company's default, then English. */
export function resolveRecipientLocale(input: { userLocale?: string | null; companyLocale?: string | null }): Locale {
  return resolveLocale({ userLocale: input.userLocale, companyLocale: input.companyLocale });
}
