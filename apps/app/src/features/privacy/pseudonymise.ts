// Pseudonymising a person who left (GDP D15). Pure: no database, no React. The write is in
// lib/db/pseudonymise.ts. Names are never searched or replaced anywhere; the only comparison of a
// name is the typed confirmation.
import { translate, type Locale } from "@/i18n";

/**
 * A number 1000-9999 not in `taken`. One draw, then up to 50 tries stepping forward from it (so a stuck
 * `random` still finds a free number); 5 digits (10000-99999) after that, like `newHandle`.
 */
export function pickPseudonymNumber(taken: Iterable<number>, random: () => number = Math.random): number {
  const used = new Set(taken);
  const start = Math.floor(random() * 9000);
  for (let i = 0; i < 50; i++) {
    const n = 1000 + ((start + i) % 9000);
    if (!used.has(n)) return n;
  }
  const from = Math.floor(random() * 90_000);
  for (let i = 0; ; i++) {
    const n = 10_000 + ((from + i) % 90_000);
    if (!used.has(n)) return n;
  }
}

/** "Former member #4471" / "Ehemaliges Mitglied #4471". */
export const pseudonymLabel = (n: number, locale: Locale): string => translate(locale, "privacyPerson.pseudonym", { n });

const squash = (s: string) => s.toLowerCase().replace(/\s+/g, "");

/** The typed confirmation: equal to the display name with case and whitespace ignored. */
export const confirmMatches = (typed: string, name: string): boolean => {
  const t = squash(typed);
  return t !== "" && t === squash(name);
};
