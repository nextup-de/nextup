// The words the assistant's two searches look for: the company's documents (lib/db/assist.ts, Postgres
// full text, `simple` config) and Microsoft 365 (features/m365/search.ts, KQL). Pure.
//
// Three cheap steps, no dictionary and no dependency:
//   - stop words out: "the", "wie", "der" match every file and push the right one off the list;
//   - a light German stem, searched as a prefix: "Bestellungen" finds "Bestellung" and "bestellen";
//   - a small German/English glossary of shop-floor and office words: an English question finds the
//     German file ("spare parts" -> "Ersatzteile") and the other way round. The glossary only adds
//     search words; what the person may read is decided by the search itself, never here.

const STOP = new Set(
  (
    // English
    "a an the and or of to in on at by for from with without about into over under up down out off is are was were be been " +
    "do does did have has had can could may might must shall should will would i me my we our you your he she it its they their " +
    "this that these those there here what which who whom whose when where why how much many any some all each every no not " +
    "than then also only just very more most please tell show give find get let know " +
    // German
    "der die das den dem des ein eine einen einem einer eines und oder aber auch nur noch schon sehr mehr am im in an auf aus bei " +
    "mit nach von vor zu zum zur über unter um durch für gegen ohne bis ab als wie was wer wen wem wessen wann wo warum wieso weshalb " +
    "welche welcher welches welchen welchem ist sind war waren sein bin bist hat haben hatte hatten wird werden wurde wurden kann " +
    "können darf dürfen muss müssen soll sollen will wollen ich mich mir wir uns sie ihr ihre ihnen er es man mein meine dein " +
    "unser unsere kein keine nicht ja nein bitte gibt gib laut steht stehen denn dass ob so da dort hier habe hast macht machen tun viel viele"
  ).split(" "),
);

/** Words that mean the same thing in German and English, as they appear in file names and text. */
const GROUPS: readonly (readonly string[])[] = [
  ["spending", "ausgaben", "purchase", "purchasing", "einkauf", "beschaffung"],
  ["order", "orders", "bestellung", "bestellen", "bestellsumme"],
  ["approval", "approve", "freigabe", "genehmigung", "signature", "unterschrift"],
  ["amount", "betrag", "limit", "grenze", "wertgrenze"],
  ["policy", "richtlinie", "regelung"],
  ["spare", "ersatzteile", "ersatzteil"],
  ["changeover", "changeovers", "umrüstung", "umrüsten", "rüstzeit"],
  ["shutdown", "werksurlaub", "betriebsurlaub", "betriebsferien"],
  ["holiday", "vacation", "urlaub"],
  ["decides", "decide", "decision", "entscheidet", "entscheidung"],
  ["cause", "reason", "ursache", "grund"],
  ["breakdown", "failure", "ausfall", "störung", "stillstand", "downtime"],
  ["maintenance", "instandhaltung", "wartung"],
  ["scrap", "ausschuss"],
  ["supplier", "suppliers", "vendor", "lieferant", "lieferanten"],
  ["price", "prices", "preis", "preise"],
  ["salary", "salaries", "gehalt", "gehälter", "gehaltsband"],
  ["stock", "inventory", "bestand", "lagerbestand"],
  ["minimum", "mindestbestand"],
  ["article", "articles", "artikel"],
  ["cost", "costs", "kosten"],
  ["shift", "schicht"],
  ["handover", "übergabe", "schichtübergabe"],
  ["travel", "trip", "reise", "dienstreise"],
  ["expenses", "expense", "spesen", "reisekosten"],
  ["overtime", "überstunden"],
  ["safety", "arbeitssicherheit", "sicherheit"],
  ["protective", "schutzausrüstung", "psa"],
  ["hazardous", "gefahrstoff", "gefahrstoffe"],
  ["password", "passwort", "kennwort"],
  ["access", "zugang", "berechtigung"],
  ["privacy", "datenschutz", "breach", "datenschutzvorfall"],
  ["investment", "investition", "investitionen"],
  ["board", "geschäftsführung", "beirat"],
  ["tooling", "werkzeug", "werkzeugwechsel"],
  ["deputy", "vertretung", "stellvertretung", "vertritt"],
  ["responsible", "zuständig", "verantwortlich", "owner"],
  ["rig", "prüfstand"],
  ["press", "presse"],
  ["line", "linie"],
  ["plant", "werk"],
  ["complaint", "reklamation"],
  ["training", "schulung"],
  ["hydraulic", "hydraulik"],
  ["blocked", "gesperrt", "sperre"],
  ["payment", "zahlung", "zahlungsziel"],
  ["terms", "konditionen", "bedingungen"],
  ["minutes", "protokoll"],
  ["checklist", "checkliste"],
  ["deviation", "abweichung"],
  ["unload", "entladen", "anlieferung"],
];

/** "Why" asks for a cause: the file says "Ursache" or "cause", never "warum". */
const INTENT: Record<string, readonly string[]> = {
  why: ["cause", "ursache"],
  warum: ["ursache", "cause"],
  wieso: ["ursache", "cause"],
  weshalb: ["ursache", "cause"],
};

const SUFFIXES = ["ungen", "ung", "ern", "en", "er", "em", "es", "e", "n", "s"] as const;

const TWINS = new Map<string, readonly string[]>();
for (const g of GROUPS) for (const w of g) TWINS.set(w, [...(TWINS.get(w) ?? []), ...g.filter((x) => x !== w)]);
/** The same, by stem: "Bestellungen" is not in the glossary, its stem "bestell" is. */
const BY_STEM = new Map<string, readonly string[]>();
for (const g of GROUPS) for (const w of g) BY_STEM.set(stem(w), [...new Set([...(BY_STEM.get(stem(w)) ?? []), ...g])]);

/** Glossary words long enough to be the end of a compound, longest first. */
const TAILS = [...TWINS.keys()].filter((w) => w.length >= 5 && /^\p{L}+$/u.test(w)).sort((a, b) => b.length - a.length);

export const isStopWord = (w: string) => STOP.has(w.toLowerCase());

/** The glossary's other words for `w` (lower case), the question-word ones included. */
export function twinsOf(w: string): readonly string[] {
  const l = w.toLowerCase();
  if (Object.hasOwn(INTENT, l)) return INTENT[l];
  return TWINS.get(l) ?? (BY_STEM.get(stem(l)) ?? []).filter((x) => x !== l);
}

/**
 * A light stem, for a prefix search: the word without its last German inflection ending, never
 * shorter than 4 letters. "Bestellungen" -> "bestell", "Teamleiter" -> "teamleit". English words
 * lose a plural "s" or an "er", which a prefix search then finds again. Words with digits stay.
 */
export function stem(w: string): string {
  const l = w.toLowerCase();
  if (l.length < 5 || /\d/.test(l)) return l;
  for (const s of SUFFIXES) if (l.endsWith(s) && l.length - s.length >= 4) return l.slice(0, -s.length);
  return l;
}

/**
 * The question's own words without stop words, then their glossary twins, unique, at most `max`.
 * `words` is the caller's tokenisation (the two searches split text differently).
 */
export function expandTerms(words: readonly string[], max: number): { own: string[]; twins: string[] } {
  const lower = words.map((w) => w.toLowerCase());
  const own = [...new Set(lower.filter((w) => !STOP.has(w)))];
  const seen = new Set(own);
  const twins: string[] = [];
  const add = (t: string) => { if (!seen.has(t)) { seen.add(t); twins.push(t); } };
  // Question words are stop words, but their intent ("why" -> cause) is worth searching for.
  // A hyphenated word ("test-rig") also by its parts.
  const parts = own.flatMap((w) => (w.includes("-") ? w.split("-").filter((x) => x.length > 2) : []));
  for (const w of [...lower.filter((x) => Object.hasOwn(INTENT, x)), ...own, ...parts]) twinsOf(w).forEach(add);
  // A German compound that ends in a glossary word: "Maschinenausfall" also searches "ausfall" and its twins.
  for (const w of own) {
    if (w.length < 9) continue;
    const tail = TAILS.find((g) => w.endsWith(g) && w !== g);
    if (tail) [tail, ...twinsOf(tail)].forEach(add);
  }
  const ownKept = own.slice(0, max);
  return { own: ownKept, twins: twins.slice(0, Math.max(0, max - ownKept.length)) };
}
