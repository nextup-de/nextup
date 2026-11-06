// Routing table matcher: free text -> the route (owner, deputy, buddy) with the most keyword hits.
// It *proposes* the row - it never decides (§11.2). Overrides are logged against the map.
export type RouteRow = { id: string; keys: string[] };

// How a keyword is found in a text (keywords-v2). Mirrored in services/brain/eval/run_eval.py, and
// tests/unit/routing.test.ts holds both to the same recorded answers.
//
// 1. Both sides are folded: lower case, and ä ö ü ß written out (ae oe ue ss). "Prüfstand", "PRÜFSTAND"
//    and "Pruefstand" are one word.
// 2. A keyword of up to SHORT_KEYWORD letters must be a whole word of the text; an English plural -s is
//    allowed. So "it" is not found in "mit" or "Zeit", and "form" not in "information".
// 3. A longer keyword may sit anywhere in a word: "werkzeug" is found in "Werkzeugwechsel" and "schicht"
//    in "Spätschicht". German builds compounds, and the general word is often the last part.
// 4. A keyword of several words ("change note", "beim Kunden") must be found as those words in a row.
export const SHORT_KEYWORD = 4;

const fold = (s: string) => s.toLowerCase().replace(/ä/g, "ae").replace(/ö/g, "oe").replace(/ü/g, "ue").replace(/ß/g, "ss");
// The words of a text, one space between them and one at each end: " schichtplan fuer linie 3 ".
const spaced = (s: string) => " " + fold(s).replace(/[^\p{L}\p{N}]+/gu, " ").trim() + " ";

/** For one text: is this keyword found in it? */
export function keywordMatcher(text: string): (key: string) => boolean {
  const folded = fold(text);
  const words = spaced(text);
  return (key) => {
    const k = spaced(key).trim(); // "it " -> "it", "Tier-1" -> "tier 1"
    if (!k) {
      const sign = fold(key).trim(); // no letter or digit, such as "€": anywhere in the text
      return sign !== "" && folded.includes(sign);
    }
    if (k.length <= SHORT_KEYWORD) return words.includes(` ${k} `) || words.includes(` ${k}s `);
    return words.includes(k);
  };
}

/** The keywords of `keys` found in `text`, in the order of `keys`. */
export function keywordHits(text: string, keys: readonly string[]): string[] {
  const found = keywordMatcher(text);
  return keys.filter((k) => found(k));
}

export function proposeRoute<R extends RouteRow>(text: string, routes: readonly R[]): R | null {
  const found = keywordMatcher(text);
  let best: R | null = null;
  let bestHits = 0;
  for (const r of routes) {
    const hits = r.keys.filter((k) => found(k)).length;
    if (hits > bestHits) {
      best = r;
      bestHits = hits;
    }
  }
  return best;
}

export type Proposal<R> = { route: R | null; confidence: number };

// Stamped on every proposal that is stored (case.raised payload.proposal). Bump it whenever the
// matching or the confidence formula changes, so /admin/decisions can compare versions.
// v2: whole words for short keywords, umlauts folded (v1 was a plain substring match).
export const ROUTER_VERSION = "keywords-v2";

// The intake box: nothing until 8 characters, then the best row with a confidence figure
// (55% + 14 per keyword hit, capped at 96). `route: null` = no row in the map matches yet.
export function propose<R extends RouteRow>(text: string, routes: readonly R[]): Proposal<R> | null {
  const t = text || "";
  if (t.trim().length < 8) return null;
  const route = proposeRoute(t, routes);
  if (!route) return { route: null, confidence: 0 };
  const hits = keywordHits(t, route.keys).length;
  return { route, confidence: Math.min(96, 55 + hits * 14) };
}
