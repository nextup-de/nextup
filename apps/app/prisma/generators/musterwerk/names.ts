// Fixed first and last names, German and international, for Musterwerk's people. Made up as a
// list on purpose: nothing here is a real person.
import type { Rng } from "./rng";

export const FIRST_NAMES = [
  "Anna", "Lukas", "Sophie", "Jonas", "Lena", "Maximilian", "Hannah", "Felix", "Laura", "Paul",
  "Marie", "Elias", "Julia", "Leon", "Katharina", "Tobias", "Sabine", "Stefan", "Monika", "Andreas",
  "Claudia", "Matthias", "Petra", "Jürgen", "Birgit", "Thomas", "Ute", "Klaus", "Heike", "Markus",
  "Aylin", "Mehmet", "Ivana", "Marek", "Sofia", "Carlos", "Elena", "Dmitri", "Priya", "Arjun",
  "Mei", "Wei", "Fatima", "Omar", "Amara", "Kofi", "Liam", "Chloé",
] as const;

export const LAST_NAMES = [
  "Müller", "Schmidt", "Schneider", "Fischer", "Weber", "Meyer", "Wagner", "Becker", "Schulz", "Hoffmann",
  "Schäfer", "Koch", "Bauer", "Richter", "Klein", "Wolf", "Schröder", "Neumann", "Schwarz", "Zimmermann",
  "Braun", "Krüger", "Hofmann", "Hartmann", "Lange", "Schmitt", "Werner", "Krause", "Meier", "Lehmann",
  "Yılmaz", "Kaya", "Demir", "Nowak", "Kowalski", "Horvat", "Novák", "Petrov", "Rossi", "Ferrari",
  "García", "Silva", "Nguyen", "Tanaka", "Patel", "Khan", "Okafor", "Dubois",
] as const;

const COMBOS = FIRST_NAMES.length * LAST_NAMES.length;

/** A fixed order over all first/last combinations; people take the next unused one. */
export function namePermutation(rng: Rng): number[] {
  return rng.fork("names").shuffle(Array.from({ length: COMBOS }, (_, i) => i));
}

/** The i-th person's name; past the last combination the order wraps (the email number keeps them apart). */
export function nameAt(order: readonly number[], i: number): { first: string; last: string } {
  const c = order[i % COMBOS];
  return { first: FIRST_NAMES[Math.floor(c / LAST_NAMES.length)], last: LAST_NAMES[c % LAST_NAMES.length] };
}

/** Lower-case ASCII for an email local part: ä -> ae, ß -> ss, é -> e. */
export function ascii(s: string): string {
  return s
    .replace(/ä/gi, "ae").replace(/ö/gi, "oe").replace(/ü/gi, "ue").replace(/ß/g, "ss")
    .normalize("NFD").replace(/[̀-ͯ]/g, "")
    .toLowerCase().replace(/[^a-z0-9]/g, "");
}
