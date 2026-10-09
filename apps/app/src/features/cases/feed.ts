// The Feed (docs/ROUTES.md /feed): every problem and idea this viewer may see, as cards to browse and
// back. Pure: the stage pill, the cover's number and line, the supporters line, the filters and the
// two sort orders. The page builds the cards from these; nothing here is invented - the cover's
// number comes from what the raiser wrote, how many back it, or how long it has been open.
import type { ReducedCase } from "./reducer";

export type FeedTone = "new" | "review" | "piloting" | "approved";
export type FeedStage = { label: string; tone: FeedTone };

// The pill on the card and in the opened idea: where the case is, in the design's four tones.
export function feedStage(c: Pick<ReducedCase, "shipped" | "building" | "decided" | "status" | "read">): FeedStage {
  if (c.shipped) return { label: "Shipped", tone: "approved" };
  if (c.building) return { label: "Piloting", tone: "piloting" };
  if (c.decided) return c.decided.answer === "yes" ? { label: "Approved", tone: "approved" } : { label: "Not now", tone: "new" };
  if (c.status === "asked") return { label: "Needs info", tone: "review" };
  if (c.read !== null) return { label: "Under review", tone: "review" };
  return { label: "New", tone: "new" };
}

// The cover's big number (at most 7 characters, units abbreviated) and the short lowercase line
// that completes it (2-4 words, at most 24 characters) - docs/AI_COVERS.md. Until the text model
// writes them: the first amount in what the raiser said it is worth, else how many back it, else
// how long it has been open.
export type FeedCover = { stat: string; hook: string };
const AMOUNT = /(?:[€$£]\s?\d[\d.,]*\s?(?:k|m|bn)?|\d[\d.,]*\s?(?:k|m|bn)?\s?(?:€|eur|%|minutes?|min|hours?|h|days?|weeks?|pcs)?)(?![\w])/i;
const UNITS: [RegExp, string][] = [[/\s?minutes?$/i, " min"], [/\s?hours?$/i, " h"], [/\s?days?$/i, " d"], [/\s?weeks?$/i, " wk"]];
export const STAT_MAX = 7, HOOK_MAX = 24;
// The number as short as it goes: "20 minutes" -> "20 min", "5 weeks" -> "5 wk" only when too long.
export function shortStat(raw: string): string {
  const s = raw.trim().replace(/\s+/g, " ");
  if (s.length <= STAT_MAX) return s;
  return UNITS.reduce((x, [re, to]) => x.replace(re, to), s);
}
// At most four words and 24 characters, cut at a word - and never ending on a loose "per" or "of".
const LOOSE = new Set(["a", "an", "the", "of", "per", "for", "to", "on", "in", "at", "by", "with", "and", "or", "from", "under", "over", "into", "than"]);
export function shortHook(text: string): string {
  const out: string[] = [];
  for (const w of text.split(" ").filter(Boolean)) {
    if (out.length === 4 || [...out, w].join(" ").length > HOOK_MAX) break;
    out.push(w);
  }
  while (out.length > 1 && LOOSE.has(out[out.length - 1])) out.pop();
  return out.join(" ");
}
export function feedCover(c: Pick<ReducedCase, "upside" | "age" | "open">, supporters: number): FeedCover {
  const m = c.upside ? AMOUNT.exec(c.upside) : null;
  const stat = m && /\d/.test(m[0]) ? shortStat(m[0]) : "";
  if (m && stat.length <= STAT_MAX) {
    // The words after the number complete it ("25 min | idle every morning"); only without them the words before.
    const tidy = (s: string) => s.replace(/^[^\p{L}\p{N}]+|[^\p{L}\p{N}]+$/gu, "").replace(/\s+/g, " ").toLowerCase();
    const hook = shortHook(tidy(c.upside.slice(m.index + m[0].length)) || tidy(c.upside.slice(0, m.index)));
    return { stat, hook: hook || "says the raiser" };
  }
  if (supporters >= 2) return { stat: String(supporters), hook: "say it affects them" };
  return { stat: c.age + " d", hook: c.open ? "waiting for an answer" : "until it was answered" };
}

// "You, Martin and 40 others" / "Martin, Tom and 40 others" - the names first, the rest as a count.
export function supportLine(names: readonly string[], me: string): string {
  const mine = names.includes(me);
  const shown = [...(mine ? ["You"] : []), ...names.filter((n) => n !== me)];
  if (!shown.length) return "Nobody backs this yet";
  if (shown.length === 1) return mine ? "You back this" : shown[0] + " backs this";
  if (shown.length === 2) return shown[0] + " and " + shown[1];
  const rest = shown.length - 2;
  return shown[0] + ", " + shown[1] + " and " + rest + (rest === 1 ? " other" : " others");
}

// A card matches a department chip when it was raised there or names that department as affected.
export const inDept = (tags: readonly string[], dept: string) => dept === "All" || tags.includes(dept);

export type FeedSort = "support" | "newest";
export const FEED_SORT_LABEL: Record<FeedSort, string> = { support: "Most supported", newest: "Newest" };
// Most supported: backers, then comments, then the one waiting longest - so with nobody backing
// anything yet it still differs from Newest.
export function sortFeed<T extends { backers: number; raisedDay: number; comments: number }>(list: readonly T[], sort: FeedSort): T[] {
  return list.slice().sort((a, b) => (sort === "newest"
    ? b.raisedDay - a.raisedDay || b.backers - a.backers
    : b.backers - a.backers || b.comments - a.comments || a.raisedDay - b.raisedDay));
}

// The four one-tap reasons a supporter can post (problems and ideas ask differently).
export const supportReasons = (kind: ReducedCase["kind"]) =>
  kind === "problem" ? ["I have this problem too", "It slows my team down", "Happens every week", "Easy to fix"] : ["It would help my team", "Saves time", "Saves money", "Easy to try"];
