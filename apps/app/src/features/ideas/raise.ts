// What the raise page (components/ideas/Raise.tsx) reads off the benchmark: the rail's five points,
// the five analysis dials (the same five, in the chat and in the analysis), the advice line, the note
// under the coach's latest reply and the sidebar's "when" labels. Every value comes from the benchmark's
// own facts (benchmarks.ts) - the two dials it has no facts for yet (Cost, Risk) say so. Pure.
import { stripTags } from "@/features/assist/check";
import type { Turn } from "@/features/assist/draft";
import type { Benchmark, BenchmarkId, BenchmarkPart } from "./benchmarks";
import { isGibberish } from "./coach";
import { DEFAULT_LOCALE, translate, type Locale, type MessageKey } from "@/i18n";

// ── The rail: what the person who decides needs before it is published ──────────────────────
// The same five points as the analysis dials, each with the one fact a decision cannot do without -
// not every question the benchmark asks: a photo, who else it helps or how far a number moves make an
// idea stronger, but none of them stops it from being published. A point is clear once the benchmark
// finds its fact, unknown when the author said they do not know yet; the first open one is next.
export type GapStatus = "clear" | "open" | "active" | "unknown";
// `id` is the benchmark's question (what a "not sure" skips), `need` the fact in a few words, `answer`
// the fact the benchmark found.
export type Gap = { id: string; key: DialKey; label: string; status: GapStatus; ask: string; need: string; answer: string | null };

// The text of a benchmark finding before its first placeholder: how the benchmark's own sentences are told apart
// in any language (benchmarks.ts writes them in the locale it is asked for).
const lead = (locale: Locale, key: MessageKey) => translate(locale, key).split("{")[0];
const isFound = (locale: Locale, text: string, keys: readonly MessageKey[]) => keys.some((k) => text.startsWith(lead(locale, k)));
// "3 more people affected": the number first, then the words of either plural form.
const isAffected = (locale: Locale, text: string) =>
  /^\d+/.test(text) && [1, 2].some((n) => text.endsWith(translate(locale, "ideas.benchFoundAffected", { count: n }).replace(/^\d+/, "")));

type RailDef = { key: DialKey; name: MessageKey; ask: MessageKey; need: MessageKey; found: readonly MessageKey[] };
const RAIL_DEFS: readonly RailDef[] = [
  { key: "value", name: "ideas.dialValue", ask: "ideas.benchMissNumber", need: "ideas.gapNeedValue", found: ["ideas.benchFoundNumber"] },
  { key: "feas", name: "ideas.dialFeas", ask: "ideas.benchMissDecider", need: "ideas.gapNeedFeas", found: ["ideas.benchFoundDecider"] },
  { key: "cost", name: "ideas.dialCost", ask: "ideas.benchMissCost", need: "ideas.gapNeedCost", found: ["ideas.benchFoundNoSpend", "ideas.benchFoundWithin", "ideas.benchFoundAbove"] },
  { key: "fit", name: "ideas.dialFit", ask: "ideas.benchMissGoal", need: "ideas.gapNeedFit", found: ["ideas.benchFoundServes"] },
  { key: "risk", name: "ideas.dialRisk", ask: "ideas.benchMissStep", need: "ideas.gapNeedRisk", found: ["ideas.benchFoundStep"] },
];
export const RAIL: readonly { key: DialKey; label: string; ask: string; need: string }[] = RAIL_DEFS.map((r) => ({
  key: r.key, label: translate(DEFAULT_LOCALE, r.name), ask: translate(DEFAULT_LOCALE, r.ask), need: translate(DEFAULT_LOCALE, r.need),
}));

// A topic is keyed by its question; the "already raised" question names a case, so it keys on its start.
export const topicKey = (q: string, locale: Locale = DEFAULT_LOCALE) => {
  const raised = translate(locale, "ideas.topicRaised");
  return q.startsWith(raised) ? raised : q;
};

// Where each of the five stands now. Clear: the benchmark found its fact. Unknown: the author said they
// do not know yet. Active: the first one still open - the one to answer next.
export function railOf(parts: readonly BenchmarkPart[], unknown: readonly string[] = [], locale: Locale = DEFAULT_LOCALE): Gap[] {
  const found = parts.flatMap((p) => p.found);
  let next = true;
  return RAIL_DEFS.map((r) => {
    const answer = found.find((f) => isFound(locale, f, r.found)) ?? null;
    const ask = translate(locale, r.ask);
    const status: GapStatus = answer ? "clear" : unknown.includes(ask) ? "unknown" : next ? "active" : "open";
    if (status === "active") next = false;
    return { id: ask, key: r.key, label: translate(locale, r.name), status, ask, need: translate(locale, r.need), answer };
  });
}

// ── The grilling rail: the unclear topics, worked through one by one ──────────────────────────
// The rail the chat shows. When the idea is first raised, the questions its benchmark cannot answer yet
// become a fixed list of topics - the preparation for the grilling: a precise idea gets one or two, a vague
// one every question the benchmark still has (up to 20). Each topic is checked off once the idea answers it,
// or once the author has answered it when it was asked (answeredOf), or marked unknown when the author does
// not know yet either. The idea can be published once none is open (components/ideas/Raise.tsx).
export const MIN_TOPICS = 2;
export const MAX_TOPICS = 20;

// Short names for the benchmark's questions (benchmarks.ts), as the rail shows them.
const TOPIC_LABEL: readonly (readonly [MessageKey, MessageKey])[] = [
  ["ideas.benchMissGoal", "ideas.topicGoal"],
  ["ideas.benchMissMeasure", "ideas.topicMeasure"],
  ["ideas.benchMissFigure", "ideas.topicFigure"],
  ["ideas.benchMissNumber", "ideas.topicUpside"],
  ["ideas.benchMissAffected", "ideas.topicAffected"],
  ["ideas.benchMissReach", "ideas.topicReach"],
  ["ideas.benchMissEvidence", "ideas.topicEvidence"],
  ["ideas.benchMissDecider", "ideas.topicDecider"],
  ["ideas.benchMissCost", "ideas.topicCost"],
  ["ideas.benchMissStep", "ideas.topicStep"],
  ["ideas.topicRaised", "ideas.topicRaisedLabel"],
  ["ideas.benchMissLong", "ideas.topicLong"],
  ["ideas.benchMissWhy", "ideas.topicWhy"],
  ["ideas.benchMissWho", "ideas.topicWho"],
];
// A topic as another language words it: the page names topics in the author's language, the turn route's
// coach reads them in the default one (the `skip` it is sent).
export const topicIn = (key: string, from: Locale, to: Locale = DEFAULT_LOCALE) => {
  const hit = TOPIC_LABEL.find(([question]) => translate(from, question) === key);
  return hit ? translate(to, hit[0]) : key;
};
export const topicLabel = (key: string, locale: Locale = DEFAULT_LOCALE) => {
  const hit = TOPIC_LABEL.find(([question]) => translate(locale, question) === key);
  return hit ? translate(locale, hit[1]) : key.replace(/[.?]$/, "");
};

// The topics for an idea, from the benchmark of its first message: the open questions in the order the
// coach takes them - the weakest bar's first (ties: the earlier bar, as weakest() does) - at most MAX_TOPICS.
// Fewer than 2 open: the weakest found points fill up.
export function topicsOf(parts: readonly BenchmarkPart[], locale: Locale = DEFAULT_LOCALE): string[] {
  const byNeed = [...parts].sort((a, b) => a.value - b.value);
  const out = [...new Set(byNeed.flatMap((p) => p.missing.map((m) => topicKey(m, locale))))].slice(0, MAX_TOPICS);
  for (const p of byNeed) {
    for (const f of p.found) if (out.length < MIN_TOPICS && !out.includes(f)) out.push(f);
  }
  return out;
}

export type Topic = { id: string; label: string; status: GapStatus; ask: string };

// Where each topic stands now. Clear: the benchmark no longer asks it, or the author answered it when it was
// asked (`answered`, answeredOf). Unknown: the author said they do not know yet. Active: the first topic from
// the top still open - the rail works down, one by one.
export function gapsOf(topics: readonly string[], parts: readonly BenchmarkPart[], unknown: readonly string[] = [], locale: Locale = DEFAULT_LOCALE, answered: readonly string[] = []): Topic[] {
  const asks = new Map(parts.flatMap((p) => p.missing.map((m): [string, string] => [topicKey(m, locale), m])));
  const open = (k: string) => asks.has(k) && !answered.includes(k);
  const active = topics.find((k) => open(k) && !unknown.includes(k)) ?? null;
  return topics.map((k) => ({
    id: k, label: topicLabel(k, locale), ask: asks.get(k) ?? k,
    status: !open(k) ? "clear" : unknown.includes(k) ? "unknown" : k === active ? "active" : "open",
  }));
}

// The topics the author has answered, read from the conversation itself (so a reload keeps them): each answer
// checks off the topic that was being asked when it was given - the first still open, by the benchmark as it
// stood just before. A "not sure" or an empty answer checks off nothing. `rounds`: per answer after the idea,
// what was said and the benchmark before it.
export function answeredOf(topics: readonly string[], rounds: readonly { said: string; parts: readonly BenchmarkPart[] }[], unknown: readonly string[] = [], locale: Locale = DEFAULT_LOCALE): string[] {
  const done: string[] = [];
  for (const r of rounds) {
    const said = stripTags(splitUpdate(r.said).said).trim();
    if (!said || isUnsure(said) || isGibberish(said)) continue;
    const asked = gapsOf(topics, r.parts, unknown, locale, done).find((g) => g.status === "active");
    if (asked) done.push(asked.id);
  }
  return done;
}

// How many topics are still to answer: open or being asked. Unknown ones count as answered - the author said so.
export const openCount = (gaps: readonly Topic[]) => gaps.filter((g) => g.status === "open" || g.status === "active").length;

// The benchmark as the coach should ask from it: the questions the author answered "not sure" to are
// left out, so the coach moves on instead of asking them again. The scores stay as they are.
export function withoutSkipped(b: Benchmark, skip: readonly string[], locale: Locale = DEFAULT_LOCALE): Benchmark {
  if (!skip.length) return b;
  return { ...b, parts: b.parts.map((p) => ({ ...p, missing: p.missing.filter((m) => !skip.includes(topicKey(m, locale))) })) };
}

// Edits made in the Idea view travel with the next message after this marker (components/ideas/Raise.tsx).
// The marker is sent in English; a message from a German session carries the German one, and both are read.
export const IDEA_UPDATE = translate(DEFAULT_LOCALE, "ideas.updateMarker");
const markerAt = (text: string): { at: number; end: number } | null => {
  for (const locale of ["en", "de"] as const) {
    const marker = translate(locale, "ideas.updateMarker");
    const at = text.indexOf(marker);
    if (at >= 0) return { at, end: at + marker.length };
  }
  return null;
};
export function splitUpdate(text: string): { said: string; updated: boolean } {
  const m = markerAt(text);
  return m ? { said: text.slice(0, m.at), updated: true } : { said: text, updated: false };
}

// An answer that says "I don't know": the active question becomes unknown, the coach moves on.
export const isUnsure = (text: string) => /\b(not sure|don.?t know|no idea|dunno|unknown|later|wei(?:ß|ss) nicht|keine ahnung|unsicher|später)\b/i.test(text);

// ── The analysis dials ────────────────────────────────────────────────────────────────────────
export type DialKey = "value" | "feas" | "cost" | "fit" | "risk";
export type Dial = { key: DialKey; label: string; value: number; note: string; basis: string; scored: boolean };

const part = (parts: readonly BenchmarkPart[], id: BenchmarkId) => parts.find((p) => p.id === id);
const sentence = (xs: readonly string[]) => xs.map((x) => x.replace(/[.?]$/, "")).join(". ") + (xs.length ? "." : "");

function fromPart(key: DialKey, label: MessageKey, p: BenchmarkPart | undefined, locale: Locale): Dial {
  const t = (k: MessageKey) => translate(locale, k);
  if (!p) return { key, label: t(label), value: 0, note: t("ideas.dialNotScored"), basis: "", scored: false };
  return {
    key, label: t(label), value: p.value, scored: true,
    note: p.found.length ? sentence(p.found) : t("ideas.dialNothingFound"),
    basis: p.missing.length ? t("ideas.dialStillOpen") + sentence(p.missing) : t("ideas.dialCovered"),
  };
}

// Cost reads the spend rule of Feasibility: no spend, within the team's authority, above it - or spend
// without an amount, which scores low until a rough figure is given.
function costDial(p: BenchmarkPart | undefined, locale: Locale): Dial {
  const t = (k: MessageKey) => translate(locale, k);
  const facts = p ? [...p.found, ...p.missing] : [];
  const has = (k: MessageKey) => facts.some((f) => f.startsWith(lead(locale, k)));
  const [value, note] = has("ideas.benchFoundNoSpend") ? [85, t("ideas.costNoSpend")]
    : has("ideas.benchFoundWithin") ? [70, facts.find((f) => f.startsWith(lead(locale, "ideas.benchFoundWithin"))) + "."]
    : has("ideas.benchFoundAbove") ? [40, t("ideas.costAbove")]
    : [35, t("ideas.costNoAmount")];
  return { key: "cost", label: t("ideas.dialCost"), value, note, basis: t("ideas.costBasis"), scored: !!p };
}

// Risk, where higher is safer like every other dial: read from facts the benchmark already has - a small
// first step and no spend lower it, spend above the team's authority and a wide reach raise it.
// Safety and quality checks are not part of it yet, and the basis says so.
export function riskDial(parts: readonly BenchmarkPart[], locale: Locale = DEFAULT_LOCALE): Dial {
  const t = (k: MessageKey, params?: Record<string, string | number>) => translate(locale, k, params);
  const found = parts.flatMap((p) => p.found);
  const has = (k: MessageKey) => found.some((f) => f.startsWith(lead(locale, k)));
  const people = Number(found.find((f) => isAffected(locale, f))?.match(/^\d+/)?.[0] ?? 0);
  const facts: [boolean, number, string][] = [
    [has("ideas.benchFoundStep"), 20, t("ideas.riskFactStep")],
    [has("ideas.benchFoundNoSpend"), 10, t("ideas.riskFactNoSpend")],
    [has("ideas.benchFoundAbove"), -15, t("ideas.riskFactAbove")],
    [people >= 3, -10, t("ideas.riskFactPeople", { count: people })],
    [has("ideas.benchFoundReach"), -5, t("ideas.riskFactReach")],
  ];
  const hit = facts.filter(([on]) => on);
  const value = Math.max(10, Math.min(95, 60 + hit.reduce((n, [, d]) => n + d, 0)));
  const level = value >= 70 ? t("ideas.riskLow") : value >= 50 ? t("ideas.riskSome") : t("ideas.riskHigher");
  const and = " " + t("ideas.listAnd") + " ";
  const lower = hit.filter(([, d]) => d > 0).map(([, , w]) => w), higher = hit.filter(([, d]) => d < 0).map(([, , w]) => w);
  const why = [lower.length ? t("ideas.riskLower", { facts: lower.join(and) }) : "", higher.length ? t(lower.length ? "ideas.riskHigherBut" : "ideas.riskHigherOnly", { facts: higher.join(and) }) : ""].filter(Boolean).join(", ");
  return {
    key: "risk", label: t("ideas.dialRisk"), value, scored: true,
    note: why ? t("ideas.riskNote", { level, why }) : t("ideas.riskNone", { level }),
    basis: t("ideas.riskBasis"),
  };
}

export function dialsOf(parts: readonly BenchmarkPart[], locale: Locale = DEFAULT_LOCALE): Dial[] {
  return [
    fromPart("value", "ideas.dialValue", part(parts, "impact"), locale),
    fromPart("feas", "ideas.dialFeas", part(parts, "feasibility"), locale),
    costDial(part(parts, "feasibility"), locale),
    fromPart("fit", "ideas.dialFit", part(parts, "fit"), locale),
    riskDial(parts, locale),
  ];
}

// A dial in one word, for the chat's card - no numbers there, those stay in the analysis. Higher is
// better on every dial, so for Cost and Risk the word is the cost or the risk itself: high value, low cost.
export function levelOf(d: Dial, locale: Locale = DEFAULT_LOCALE): string {
  if (!d.scored) return translate(locale, "ideas.levelNot");
  const band = d.value >= 70 ? 2 : d.value >= 40 ? 1 : 0;
  const words: readonly MessageKey[] = d.key === "cost" || d.key === "risk"
    ? ["ideas.levelHigh", "ideas.levelMedium", "ideas.levelLow"]
    : ["ideas.levelWeak", "ideas.levelMedium", "ideas.levelStrong"];
  return translate(locale, words[band]);
}

// One moved dial as the chat's card shows it. Cost and Risk are named as the cost and the risk themselves
// ("Cost", not "Low cost"), so the word, the arrow and the bar follow that quantity: cost that fell reads
// "Cost ▼ Low" with a short bar. `better` is whether the idea gained - it, not the arrow, gives the colour.
export type MoveView = { label: string; arrow: "▲" | "▼"; better: boolean; level: string; bar: number };
export function moveView(d: Dial, move: Move, locale: Locale = DEFAULT_LOCALE): MoveView {
  const better = move === "up";
  const inverse = d.key === "cost" || d.key === "risk";
  const label = d.key === "cost" ? translate(locale, "ideas.dialCostPlain") : d.key === "risk" ? translate(locale, "ideas.dialRiskPlain") : d.label;
  const bar = d.scored ? Math.max(4, inverse ? 100 - d.value : d.value) : 0;
  return { label, arrow: better !== inverse ? "▲" : "▼", better, level: levelOf(d, locale), bar };
}

// The dials that got better from one reading of the idea to the next (the ▲ in the chat's card).
export function dialsUp(before: readonly Dial[], now: readonly Dial[]): DialKey[] {
  return now.filter((d) => d.value > (before.find((b) => b.key === d.key)?.value ?? d.value)).map((d) => d.key);
}

// The dials an answer moved, up or down, from one reading of the idea to the next (the chat's card shows
// only these after NextUp's first reply). A dial not scored before and scored now counts as up.
export type Move = "up" | "down";
export function dialsMoved(before: readonly Dial[], now: readonly Dial[]): Partial<Record<DialKey, Move>> {
  const out: Partial<Record<DialKey, Move>> = {};
  for (const d of now) {
    const b = before.find((x) => x.key === d.key);
    const was = b && b.scored ? b.value : null, is = d.scored ? d.value : null;
    if (was === is || is === null) continue;
    out[d.key] = was === null || is > was ? "up" : "down";
  }
  return out;
}

// ── Advice ────────────────────────────────────────────────────────────────────────────────────
export type AdviceId = "approve" | "pilot" | "info";
export type Advice = { id: AdviceId; name: string; why: string };
export function adviceOf(overall: number, threshold: number, team: string, locale: Locale = DEFAULT_LOCALE): Advice {
  const t = (k: MessageKey, params?: Record<string, string | number>) => translate(locale, k, params);
  if (overall >= threshold) return { id: "approve", name: t("ideas.adviceApprove"), why: t("ideas.adviceApproveWhy") };
  if (overall >= threshold - 15) return { id: "pilot", name: t("ideas.advicePilot"), why: t("ideas.advicePilotWhy", { team }) };
  return { id: "info", name: t("ideas.adviceInfo"), why: t("ideas.adviceInfoWhy") };
}

// ── Labels ────────────────────────────────────────────────────────────────────────────────────
const DAYS: readonly MessageKey[] = ["ideas.daySun", "ideas.dayMon", "ideas.dayTue", "ideas.dayWed", "ideas.dayThu", "ideas.dayFri", "ideas.daySat"];
const MONTHS: readonly MessageKey[] = [
  "ideas.monthJan", "ideas.monthFeb", "ideas.monthMar", "ideas.monthApr", "ideas.monthMay", "ideas.monthJun",
  "ideas.monthJul", "ideas.monthAug", "ideas.monthSep", "ideas.monthOct", "ideas.monthNov", "ideas.monthDec",
];
const clock = (d: Date) => d.getHours() + ":" + String(d.getMinutes()).padStart(2, "0");

// "Now", "14:02" today, "Yesterday", "Mon" this week, "3 Oct" before.
export function whenLabel(iso: string, now: Date, locale: Locale = DEFAULT_LOCALE): string {
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return "";
  if (now.getTime() - d.getTime() < 60_000) return translate(locale, "ideas.whenNow");
  const day = (x: Date) => new Date(x.getFullYear(), x.getMonth(), x.getDate()).getTime();
  const days = Math.round((day(now) - day(d)) / 86_400_000);
  if (days <= 0) return clock(d);
  if (days === 1) return translate(locale, "common.yesterday");
  if (days < 7) return translate(locale, DAYS[d.getDay()]);
  return translate(locale, "ideas.whenDate", { day: d.getDate(), month: translate(locale, MONTHS[d.getMonth()]) });
}
// The sidebar's time groups: "today", "week" (the six days before) or "earlier", by calendar day like
// whenLabel. Days back from the demo clock work too (dayGroup), for the sample cases that carry no date.
export type WhenGroup = "today" | "week" | "earlier";
export const dayGroup = (daysAgo: number): WhenGroup => (daysAgo <= 0 ? "today" : daysAgo < 7 ? "week" : "earlier");
export function whenGroup(iso: string, now: Date): WhenGroup {
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return "earlier";
  const day = (x: Date) => new Date(x.getFullYear(), x.getMonth(), x.getDate()).getTime();
  return dayGroup(Math.round((day(now) - day(d)) / 86_400_000));
}
export const clockLabel = (iso: string) => { const d = new Date(iso); return Number.isNaN(d.getTime()) ? "" : clock(d); };

// "Raise it, Sam": the first name when there is one, the whole name when it starts with an initial.
export const greetName = (name: string) => { const first = name.trim().split(/\s+/)[0] ?? ""; return first.endsWith(".") || !first ? name : first; };

export const initials = (name: string) => {
  const t = name.replace(/[^A-Za-zÀ-ÿ ]/g, " ").trim().split(/\s+/).filter(Boolean);
  return t.length ? (t[0][0] + (t.length > 1 ? t[t.length - 1][0] : "")).toUpperCase() : "?";
};

// The idea as the author wrote it: the first message is the description, what follows a blank line is context.
export function splitIdea(first: string): { description: string; context: string } {
  const [description = "", ...rest] = first.split("\n\n");
  return { description, context: rest.join("\n\n") };
}

// The idea as it stands: the first message - or the author's last edit of it, sent with a message - and
// every answer since, added to its context one per line. An answer the page reads as "not sure" adds
// nothing, nor does keyboard mashing; the coach's words never do.
export function ideaNow(turns: readonly Turn[]): string {
  let idea: string | null = null;
  const added: string[] = [];
  for (const t of turns) {
    if (t.role !== "user") continue;
    if (idea === null) { idea = t.text; continue; }
    const m = markerAt(t.text);
    if (m) { idea = t.text.slice(m.end); added.length = 0; }
    const said = stripTags(m ? t.text.slice(0, m.at) : t.text);
    if (said && !isUnsure(said) && !isGibberish(said)) added.push(said);
  }
  const { description, context } = splitIdea(idea ?? "");
  const all = [context.trim(), ...added].filter(Boolean).join("\n");
  return all ? description + "\n\n" + all : description;
}
