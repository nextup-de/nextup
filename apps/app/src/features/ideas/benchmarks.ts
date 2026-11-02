// The idea studio's benchmarks: four bars an idea has to fill before it can be published
// (docs/IDEAS.md). Arithmetic over the text and the company context, never model output - so
// every point names the fact behind it, and chatting cannot talk the score up. The coach
// (coach.ts) reads `missing` to decide what to ask next. Pure.
import { closest, goalOf, words, type KnownCase } from "@/features/evaluate";
import { propose, type RouteRow } from "@/features/routing";
import { DEFAULT_LOCALE, translate, type Locale, type MessageKey } from "@/i18n";
import { formatEuro } from "@/i18n/format";

export type BenchmarkId = "fit" | "impact" | "feasibility" | "clarity";
export type BenchmarkPart = { id: BenchmarkId; label: string; value: number; found: string[]; missing: string[] };
export type Benchmark = { overall: number; parts: BenchmarkPart[]; sameAs: KnownCase | null };

export type IdeaInput = { text: string; affected: readonly string[]; attachments: number };
export type BenchmarkContext = {
  routes: readonly (RouteRow & { type: string })[];
  goals: readonly { goal: string; keys: string[] }[];
  cases: readonly KnownCase[]; // what is already raised, for "has this been said before?"
  spendLimitEur: number | null; // team-level authority - the company's spend rule; null: none set
};

export const DEFAULT_PUBLISH_THRESHOLD = 70;
export const canPublish = (overall: number, threshold: number) => overall >= threshold;

// Labels as the page shows them; the order is the order of the bars.
const LABEL_KEY: Record<BenchmarkId, MessageKey> = {
  fit: "ideas.benchLabelFit",
  impact: "ideas.benchLabelImpact",
  feasibility: "ideas.benchLabelFeasibility",
  clarity: "ideas.benchLabelClarity",
};
export const benchmarkLabel = (id: BenchmarkId, locale: Locale = DEFAULT_LOCALE) => translate(locale, LABEL_KEY[id]);
export const BENCHMARK_LABEL: Record<BenchmarkId, string> = {
  fit: benchmarkLabel("fit"),
  impact: benchmarkLabel("impact"),
  feasibility: benchmarkLabel("feasibility"),
  clarity: benchmarkLabel("clarity"),
};

const QUANTITY = /\d+(?:[.,]\d+)?\s*(?:%|€|k\b|eur|euro|min|minutes?|hours?|h\b|days?|weeks?|people|parts|orders|shifts|per)/i;
const MEASURE = /\b(kpi|rate|scrap|rework|lead time|downtime|minutes?|hours?|per (?:week|month|shift|day)|%)/i;
const REACH = /\b(every|all|each|whole|both|across|shifts?|teams?|lines?|sites?|departments?)\b/i;
const FIRST_STEP = /\b(first step|start (?:with|by)|pilot|trial|test (?:it|on)|try (?:it|on)|prototype|for (?:one|a) (?:week|month|line|shift))\b/i;
const WHY = /\b(because|so that|so we|which means|otherwise|saves?|avoids?|instead of)\b/i;
const WHO = /\b(we|team|shift|operators?|leads?|engineers?|colleagues|customers?|new hires|apprentices|maintenance|finance|it)\b/i;
// Money, not effort: "costs 20 minutes" is not spend, so a bare "cost" does not count.
const SPEND = /€|\beur\b|\bspend|\bbuy|\border(?:s|ing)? (?:a|the|new|spare)|purchase|budget|invoice|licen[cs]e/i;

// The largest euro amount named in the text, or null. "€5k", "5.000 €", "300 EUR".
export function amountEur(text: string): number | null {
  let best: number | null = null;
  const re = /(?:€\s*(\d+(?:[.,]\d+)?)\s*(k)?)|(?:(\d+(?:[.,]\d+)?)\s*(k)?\s*(?:€|eur\b|euro))/gi;
  for (const m of text.matchAll(re)) {
    const raw = (m[1] ?? m[3] ?? "").replace(/[.,](?=\d{3}\b)/g, "").replace(",", ".");
    const n = Number(raw) * ((m[2] ?? m[4]) ? 1000 : 1);
    if (Number.isFinite(n) && (best === null || n > best)) best = n;
  }
  return best;
}

type Rule = { points: number; found?: string; missing?: string };
// A part is the sum of the rules that hit, capped at 100. A rule with no `found` is a miss.
function part(id: BenchmarkId, rules: Rule[], locale: Locale): BenchmarkPart {
  const found: string[] = [], missing: string[] = [];
  let value = 0;
  for (const r of rules) {
    if (r.found !== undefined) { value += r.points; found.push(r.found); }
    else if (r.missing) missing.push(r.missing);
  }
  return { id, label: benchmarkLabel(id, locale), value: Math.min(100, value), found, missing };
}
const hit = (on: boolean, points: number, found: string, missing?: string): Rule => (on ? { points, found } : { points, missing });

export function benchmark(idea: IdeaInput, ctx: BenchmarkContext, locale: Locale = DEFAULT_LOCALE): Benchmark {
  const t = (key: MessageKey, params?: Record<string, string | number>) => translate(locale, key, params);
  const text = idea.text.trim();
  const n = words(text).length;
  // The goal with the most keyword hits, and at least two: "wait" alone should not beat three changeover words.
  const goal = goalOf(text, ctx.goals);
  const route = propose(text, ctx.routes)?.route ?? null;
  const amount = amountEur(text);
  const spends = SPEND.test(text);
  const sameAs = closest(text, ctx.cases.filter((c) => c.open), (c) => c.title);
  const people = idea.affected.length;

  const fit = part("fit", [
    hit(!!goal, 60, goal ? t("ideas.benchFoundServes", { goal: goal.goal }) : "", t("ideas.benchMissGoal")),
    hit(MEASURE.test(text), 25, t("ideas.benchFoundMeasure"), t("ideas.benchMissMeasure")),
    hit(!!goal && QUANTITY.test(text), 15, t("ideas.benchFoundFigure"), t("ideas.benchMissFigure")),
  ], locale);
  const impact = part("impact", [
    hit(QUANTITY.test(text), 40, t("ideas.benchFoundNumber"), t("ideas.benchMissNumber")),
    hit(people > 0, Math.min(30, people * 10), t("ideas.benchFoundAffected", { count: people }), t("ideas.benchMissAffected")),
    hit(REACH.test(text), 15, t("ideas.benchFoundReach"), t("ideas.benchMissReach")),
    hit(idea.attachments > 0, 15, t("ideas.benchFoundEvidence"), t("ideas.benchMissEvidence")),
  ], locale);
  const feasibility = part("feasibility", [
    hit(!!route, 35, route ? t("ideas.benchFoundDecider", { route: route.type }) : "", t("ideas.benchMissDecider")),
    !spends ? { points: 25, found: t("ideas.benchFoundNoSpend") }
      : ctx.spendLimitEur === null ? { points: 10, found: t("ideas.benchFoundNoRule") }
      : amount !== null && amount <= ctx.spendLimitEur ? { points: 25, found: t("ideas.benchFoundWithin", { limit: formatEuro(locale, ctx.spendLimitEur) }) }
      : amount !== null ? { points: 10, found: t("ideas.benchFoundAbove") }
      : { points: 0, missing: t("ideas.benchMissCost") },
    hit(FIRST_STEP.test(text), 40, t("ideas.benchFoundStep"), t("ideas.benchMissStep")),
  ], locale);
  const clarity = part("clarity", [
    hit(!sameAs, 40, t("ideas.benchFoundNew"), sameAs ? t("ideas.benchMissRaised", { title: sameAs.title }) : undefined),
    hit(n >= 12, 20, t("ideas.benchFoundLong"), t("ideas.benchMissLong")),
    hit(n >= 30, 10, t("ideas.benchFoundDetailed"), undefined),
    hit(WHY.test(text), 15, t("ideas.benchFoundWhy"), t("ideas.benchMissWhy")),
    hit(WHO.test(text) || people > 0, 15, t("ideas.benchFoundWho"), t("ideas.benchMissWho")),
  ], locale);

  const parts = [fit, impact, feasibility, clarity];
  return { overall: Math.round(parts.reduce((a, p) => a + p.value, 0) / parts.length), parts, sameAs };
}

// The bar with the most room to grow that still has something to ask; ties go to the earlier bar.
export function weakest(b: Benchmark): BenchmarkPart | null {
  return b.parts.filter((p) => p.missing.length > 0).reduce<BenchmarkPart | null>((w, p) => (!w || p.value < w.value ? p : w), null);
}

// Points gained or lost per bar since the last turn - the ▲/▼ next to each bar.
export function deltas(prev: Benchmark | null, now: Benchmark): Record<BenchmarkId, number> & { overall: number } {
  const of = (b: Benchmark | null, id: BenchmarkId) => b?.parts.find((p) => p.id === id)?.value ?? 0;
  return {
    fit: now.parts[0].value - of(prev, "fit"),
    impact: now.parts[1].value - of(prev, "impact"),
    feasibility: now.parts[2].value - of(prev, "feasibility"),
    clarity: now.parts[3].value - of(prev, "clarity"),
    overall: now.overall - (prev?.overall ?? 0),
  };
}
