// The idea coach: after each message the idea is re-read and benchmarked, and the coach answers
// with what got better and ONE challenging question aimed at the weakest bar - the
// feedback ⇄ develop loop from the whiteboard. Pure.
//
// coachMock() is the reply when no model is configured (demo, e2e, local); coachBrief() is what
// a model is told in coach mode (features/assist/prompt.ts), so both answer the same question.
import { SITE } from "@/config/site";
import { stripTags } from "@/features/assist/check";
import type { Turn } from "@/features/assist/draft";
import { DEFAULT_LOCALE, translate, type Locale, type MessageKey } from "@/i18n";
import { deltas, weakest, type Benchmark } from "./benchmarks";

export const IDEA_PROMPT_VERSION = "idea-coach-v2";

// A title as the idea shows it: never cut with "…". Over 56 characters it ends at the first natural break
// (a comma, a dash, "because", "so", "that"…) after the 12th; with none, at the last word that fits. Then
// no trailing punctuation, no dangling small word, a capital first letter.
const TITLE_CUT = 56;
const BREAK = new RegExp("^(.{12," + TITLE_CUT + "}?)(?:,|;|:| — | - | so | because | which | since | but | when | where | and | that | to )", "i");
const DANGLING = /\s+(the|a|an|and|or|of|to|for|in|on|at|with|by|from|so|that|is|are|we|our|it)$/i;
export function finishTitle(raw: string): string {
  let t = raw.replace(/\s*…$/, "").replace(/\s+/g, " ").trim();
  if (t.length > TITLE_CUT) t = BREAK.exec(t)?.[1] ?? t.slice(0, TITLE_CUT).replace(/\s+\S*$/, "");
  t = t.replace(/[\s,;:—-]+$/, "");
  while (DANGLING.test(t)) t = t.replace(DANGLING, "");
  return t.charAt(0).toUpperCase() + t.slice(1);
}

// Keyboard mashing ("jd klafkhdjahjsdhf ajsdhljf"): at least half of its longer words carry five
// or more consonant sounds in a row, which real English and German words almost never do once
// "sch", "ch", "th" and "ng" count as one ("strengths", "Rüstzeit" pass).
const MASHED = /[bcdfghjklmnpqrstvwxzß]{5,}/;
const mashed = (w: string) => MASHED.test(w.replace(/sch|ch|th|ng|ck/g, "c"));
export function isGibberish(text: string): boolean {
  const long = text.toLowerCase().match(/[a-zäöüß]{4,}/g) ?? [];
  if (long.length === 0) return false;
  return long.filter(mashed).length / long.length >= 0.5;
}

// The idea as it stands: the first paragraph of the first message is the title, everything the
// author wrote after it (the context under that line, later answers) is the body. The coach's own
// words are never part of the idea - only the author's - and neither is a message that is only
// keyboard mashing, so it cannot move the score.
export function ideaFromTurns(turns: readonly Turn[]): { title: string; body: string; text: string } {
  const mine = turns.filter((t) => t.role === "user").map((t) => stripTags(t.text).trim()).filter(Boolean);
  const [head = "", ...more] = (mine[0] ?? "").split(/\n\s*\n/);
  const title = finishTitle(head);
  const later = mine.slice(1).filter((m) => !isGibberish(m)).join("\n");
  const body = [isGibberish(mine[0] ?? "") ? "" : more.join("\n\n").trim(), later].filter(Boolean).join("\n");
  const text = [isGibberish(mine[0] ?? "") ? "" : (mine[0] ?? ""), later].filter(Boolean).join("\n");
  return { title, body, text };
}

const lowerFirst = (s: string) => s.charAt(0).toLowerCase() + s.slice(1);

type Say = (key: MessageKey, params?: Record<string, string | number>) => string;
const sayIn = (locale: Locale): Say => (key, params) => translate(locale, key, params);

// "12 points to publish" / "Ready to publish".
export function toGo(overall: number, threshold: number, locale: Locale = DEFAULT_LOCALE): string {
  const n = threshold - overall;
  return n <= 0 ? translate(locale, "ideas.coachToGoReady") : translate(locale, "ideas.coachToGo", { count: n });
}

// What the benchmark says is a message of the catalog (benchmarks.ts), in the page's language; the coach finds it again by its key, so every
// table below is keyed by the benchmark's message key and the sentence is the coach's own key (plan REM, K1).

/** The gaps as nouns ("a number on the upside"), per bar. */
const GAPS: [MessageKey, MessageKey][] = [
  ["ideas.benchMissGoal", "ideas.coachGapGoal"], ["ideas.benchMissMeasure", "ideas.coachGapMeasure"], ["ideas.benchMissFigure", "ideas.coachGapFigure"],
  ["ideas.benchMissNumber", "ideas.coachGapNumber"], ["ideas.benchMissAffected", "ideas.coachGapAffected"], ["ideas.benchMissReach", "ideas.coachGapReach"],
  ["ideas.benchMissEvidence", "ideas.coachGapEvidence"], ["ideas.benchMissDecider", "ideas.coachGapDecider"], ["ideas.benchMissCost", "ideas.coachGapCost"],
  ["ideas.benchMissStep", "ideas.coachGapStep"], ["ideas.benchMissLong", "ideas.coachGapLong"], ["ideas.benchMissWhy", "ideas.coachGapWhy"],
  ["ideas.benchMissWho", "ideas.coachGapWho"],
];
// Why the person who decides will ask for each gap - so the sentence fits the question, not just the bar.
const WHY_ASK: [MessageKey, MessageKey][] = [
  ["ideas.benchMissGoal", "ideas.coachWhyGoal"], ["ideas.benchMissMeasure", "ideas.coachWhyMeasure"], ["ideas.benchMissFigure", "ideas.coachWhyFigure"],
  ["ideas.benchMissNumber", "ideas.coachWhyNumber"], ["ideas.benchMissAffected", "ideas.coachWhyAffected"], ["ideas.benchMissReach", "ideas.coachWhyReach"],
  ["ideas.benchMissEvidence", "ideas.coachWhyEvidence"], ["ideas.benchMissDecider", "ideas.coachWhyDecider"], ["ideas.benchMissCost", "ideas.coachWhyCost"],
  ["ideas.benchMissStep", "ideas.coachWhyStep"], ["ideas.benchMissLong", "ideas.coachWhyLong"], ["ideas.benchMissWhy", "ideas.coachWhyWhy"],
  ["ideas.benchMissWho", "ideas.coachWhyWho"],
];

/** The head of the "already raised" question, up to the title it names: every other question is told apart by its whole text. */
const raisedHead = (locale: Locale): string => translate(locale, "ideas.benchMissRaised", { title: "\u0000" }).split("\u0000")[0];
const isRaised = (missing: string, locale: Locale): boolean => missing.startsWith(raisedHead(locale));
const byMissing = (table: readonly [MessageKey, MessageKey][], missing: string, locale: Locale): MessageKey | null =>
  table.find(([k]) => missing === translate(locale, k))?.[1] ?? null;

const gap = (missing: string, locale: Locale) => {
  const key = byMissing(GAPS, missing, locale);
  return key ? translate(locale, key) : lowerFirst(missing.replace(/[?.]$/, ""));
};
const whyAsk = (missing: string, locale: Locale) => {
  const key = isRaised(missing, locale) ? "ideas.coachWhyRaised" : byMissing(WHY_ASK, missing, locale);
  return key ? translate(locale, key) : "";
};

/** What a benchmark message with one value in it says, or null: "Serves “X”" -> "X". The template is read from the catalog, so it fits both languages. */
function valueOf(text: string, key: MessageKey, name: string, locale: Locale): string | null {
  const [head, tail] = translate(locale, key, { [name]: "\u0000" }).split("\u0000");
  return text.startsWith(head) && text.endsWith(tail) && text.length >= head.length + tail.length ? text.slice(head.length, text.length - tail.length) : null;
}
/** The number in "2 more people affected", when the text is the benchmark's line for that many people. */
function affectedCount(found: string, locale: Locale): number | null {
  const n = Number(/\d+/.exec(found)?.[0]);
  return Number.isInteger(n) && found === translate(locale, "ideas.benchFoundAffected", { count: n }) ? n : null;
}

// "it serves “…”, the owner of “…” would decide it, and nothing like it has been raised before"
function seen(b: Benchmark, locale: Locale): string {
  const t = sayIn(locale);
  const facts: string[] = [];
  const same = (found: string, key: MessageKey) => found === t(key);
  for (const p of b.parts) for (const f of p.found) {
    const goal = valueOf(f, "ideas.benchFoundServes", "goal", locale);
    const route = valueOf(f, "ideas.benchFoundDecider", "route", locale);
    const people = affectedCount(f, locale);
    if (goal !== null) facts.push(t("ideas.coachSeenServes", { goal }));
    else if (route !== null) facts.push(t("ideas.coachSeenDecider", { route }));
    else if (same(f, "ideas.benchFoundNumber")) facts.push(t("ideas.coachSeenNumber"));
    else if (same(f, "ideas.benchFoundStep")) facts.push(t("ideas.coachSeenStep"));
    else if (same(f, "ideas.benchFoundWhy")) facts.push(t("ideas.coachSeenWhy"));
    else if (same(f, "ideas.benchFoundNew")) facts.push(t("ideas.coachSeenNew"));
    else if (people !== null) facts.push(t("ideas.coachSeenAffected", { count: people }));
  }
  return list(facts.slice(0, 4), locale);
}
// A `found` fact as "the idea now …": "Upside has a number" -> "puts a number on the upside".
const GAINED: [MessageKey, MessageKey][] = [
  ["ideas.benchFoundMeasure", "ideas.coachGainedMeasure"], ["ideas.benchFoundFigure", "ideas.coachGainedFigure"], ["ideas.benchFoundNumber", "ideas.coachGainedNumber"],
  ["ideas.benchFoundReach", "ideas.coachGainedReach"], ["ideas.benchFoundEvidence", "ideas.coachGainedEvidence"], ["ideas.benchFoundNoSpend", "ideas.coachGainedNoSpend"],
  ["ideas.benchFoundAbove", "ideas.coachGainedAbove"], ["ideas.benchFoundStep", "ideas.coachGainedStep"], ["ideas.benchFoundNew", "ideas.coachGainedNew"],
  ["ideas.benchFoundLong", "ideas.coachGainedLong"], ["ideas.benchFoundDetailed", "ideas.coachGainedDetailed"], ["ideas.benchFoundWhy", "ideas.coachGainedWhy"],
  ["ideas.benchFoundWho", "ideas.coachGainedWho"],
];
function gained(found: string, locale: Locale): string {
  const t = sayIn(locale);
  const goal = valueOf(found, "ideas.benchFoundServes", "goal", locale);
  if (goal !== null) return t("ideas.coachGainedServes", { goal });
  const route = valueOf(found, "ideas.benchFoundDecider", "route", locale);
  if (route !== null) return t("ideas.coachGainedDecider", { route });
  if (valueOf(found, "ideas.benchFoundWithin", "limit", locale) !== null) return t("ideas.coachGainedWithin");
  const hit = GAINED.find(([k]) => found === t(k));
  if (hit) return t(hit[1]);
  const people = affectedCount(found, locale);
  return people !== null ? t("ideas.coachGainedAffected", { count: people }) : lowerFirst(found);
}
const list = (xs: string[], locale: Locale = DEFAULT_LOCALE) => xs.length <= 1 ? xs.join("") : xs.slice(0, -1).join(", ") + " " + translate(locale, "ideas.listAnd") + " " + xs[xs.length - 1];

// `said` is the message just sent; `offers` is how many suggested answers the page shows under it; `locale` is the viewer's.
// Two or three short paragraphs: what the benchmarks can see now, then the one question and why
// the person who decides will ask it. The benchmarks must have been made in the same locale (scoreDraft takes it).
export function coachMock(prev: Benchmark | null, now: Benchmark, threshold: number, said = "", offers = 0, locale: Locale = DEFAULT_LOCALE): string {
  const t = sayIn(locale);
  const d = deltas(prev, now);
  const w = weakest(now);
  const again = prev !== null && d.overall <= 0 && w !== null && weakest(prev)?.missing[0] === w.missing[0];
  const left = threshold - now.overall;
  const gaps = list(now.parts.map((p) => p.missing[0]).filter((m): m is string => !!m && !isRaised(m, locale)).map((m) => gap(m, locale)).slice(0, 3), locale);
  const read: string[] = [];

  if (said && isGibberish(said)) {
    read.push(t("ideas.coachSlip", { n: now.overall }));
  } else if (!prev) {
    read.push(now.overall >= threshold ? t("ideas.coachFirstEnough", { n: now.overall }) : t("ideas.coachFirstNeeds", { n: now.overall, threshold, left }));
    const s = seen(now, locale);
    if (s) read.push(t("ideas.coachCanSee", { facts: s }));
    if (gaps) read.push(t("ideas.coachCannotSee", { gaps }));
  } else if (d.overall > 0) {
    const best = now.parts.reduce((b, p) => (d[p.id] > d[b.id] ? p : b), now.parts[0]);
    const was = new Set(prev.parts.find((p) => p.id === best.id)?.found ?? []);
    const why = best.found.filter((f) => !was.has(f)).map((f) => gained(f, locale)).slice(0, 2);
    read.push(t("ideas.coachUp", { delta: d.overall, n: now.overall, bar: locale === DEFAULT_LOCALE ? best.label.toLowerCase() : best.label, why: why.length ? t("ideas.coachUpBecause", { why: list(why, locale) }) : "" }));
    if (left > 0) read.push(t("ideas.coachLeft", { count: left, gaps: gaps ? t("ideas.coachLeftOpen", { gaps }) : "" }));
    else read.push(t("ideas.coachOver"));
  } else {
    read.push(t("ideas.coachStill", { n: now.overall, gaps: gaps ? t("ideas.coachStillOpen", { gaps }) : "" }));
  }
  // Said once, when the match first appears; the chip and the side panel keep showing it.
  if (now.sameAs && !prev?.sameAs) read.push(t("ideas.coachClose", { title: now.sameAs.title }));

  const ask: string[] = [];
  // A German question keeps its capital after the colon; an English one reads on as a clause.
  const asIs = (q: string) => (locale === DEFAULT_LOCALE ? lowerFirst(q) : q);
  if (w && again) {
    ask.push(t("ideas.coachNeedAgain", { question: asIs(w.missing[0]), offers: offers ? t("ideas.coachNeedOffers") : "" }));
  } else if (w) {
    ask.push(t("ideas.coachWeakest", { bar: w.label, value: w.value, question: w.missing[0] }));
    ask.push(whyAsk(w.missing[0], locale) + (offers ? t(prev ? "ideas.coachOffersLater" : "ideas.coachOffersFirst") : ""));
  } else if (now.overall >= threshold) {
    ask.push(t("ideas.coachReady", { site: SITE.name }));
  }
  return [read.join(" "), ask.join(" ")].filter(Boolean).join("\n\n");
}

// What a model is told in coach mode: the numbers it may not change and the one gap to ask about.
export function coachBrief(now: Benchmark, threshold: number): string {
  const w = weakest(now);
  const bars = now.parts.map((p) => `- ${p.label}: ${p.value}/100${p.missing.length ? " (missing: " + p.missing.join("; ") + ")" : ""}`).join("\n");
  return [
    `The idea scores ${now.overall}/100; it can be published at ${threshold}. The scores are computed, not yours to change - never state a different number.`,
    bars,
    now.sameAs ? `A close match is already raised: "${now.sameAs.title}". Mention it and ask what is different about theirs: the desk sees both and can merge them.` : "",
    w ? `Ask exactly one short, challenging question that would raise "${w.label}". Do not answer it yourself.` : "Tell them it is ready to publish.",
  ].filter(Boolean).join("\n");
}
