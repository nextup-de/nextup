// The idea studio's benchmarks: four bars an idea has to fill before it can be published
// (docs/IDEAS.md). Arithmetic over the text and the company context, never model output - so
// every point names the fact behind it, and chatting cannot talk the score up. The coach
// (coach.ts) reads `missing` to decide what to ask next. Pure.
import { closest, words, type KnownCase } from "@/features/evaluate";
import { propose, type RouteRow } from "@/features/routing";

export type BenchmarkId = "fit" | "impact" | "feasibility" | "clarity";
export type BenchmarkPart = { id: BenchmarkId; label: string; value: number; found: string[]; missing: string[] };
export type Benchmark = { overall: number; parts: BenchmarkPart[]; sameAs: KnownCase | null };

export type IdeaInput = { text: string; affected: readonly string[]; attachments: number };
export type BenchmarkContext = {
  routes: readonly (RouteRow & { type: string })[];
  goals: readonly { goal: string; keys: string[] }[];
  cases: readonly KnownCase[]; // what is already raised, for "has this been said before?"
  spendLimitEur: number; // team-level authority - features/evaluate SPEND_RULE
};

export const DEFAULT_PUBLISH_THRESHOLD = 70;
export const canPublish = (overall: number, threshold: number) => overall >= threshold;

// Labels as the page shows them; the order is the order of the bars.
export const BENCHMARK_LABEL: Record<BenchmarkId, string> = {
  fit: "Strategic fit",
  impact: "Impact & reach",
  feasibility: "Feasibility",
  clarity: "Novelty & clarity",
};

const QUANTITY = /\d+(?:[.,]\d+)?\s*(?:%|€|k\b|eur|euro|min|minutes?|hours?|h\b|days?|weeks?|people|parts|orders|shifts|per)/i;
const MEASURE = /\b(kpi|rate|scrap|rework|lead time|downtime|minutes?|hours?|per (?:week|month|shift|day)|%)/i;
const REACH = /\b(every|all|each|whole|both|across|shifts?|teams?|lines?|sites?|departments?)\b/i;
const FIRST_STEP = /\b(first step|start (?:with|by)|pilot|trial|test (?:it|on)|try (?:it|on)|prototype|for (?:one|a) (?:week|month|line|shift))\b/i;
const WHY = /\b(because|so that|so we|which means|otherwise|saves?|avoids?|instead of)\b/i;
const WHO = /\b(we|team|shift|operators?|leads?|engineers?|colleagues|customers?|new hires|apprentices|maintenance|finance|it)\b/i;
const SPEND = /€|\beur\b|spend|buy|order|purchase|budget|cost|invoice|licen[cs]e/i;

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
function part(id: BenchmarkId, rules: Rule[]): BenchmarkPart {
  const found: string[] = [], missing: string[] = [];
  let value = 0;
  for (const r of rules) {
    if (r.found !== undefined) { value += r.points; found.push(r.found); }
    else if (r.missing) missing.push(r.missing);
  }
  return { id, label: BENCHMARK_LABEL[id], value: Math.min(100, value), found, missing };
}
const hit = (on: boolean, points: number, found: string, missing?: string): Rule => (on ? { points, found } : { points, missing });

export function benchmark(idea: IdeaInput, ctx: BenchmarkContext): Benchmark {
  const text = idea.text.trim();
  const lower = text.toLowerCase();
  const n = words(text).length;
  // The goal with the most keyword hits, not the first with one: "wait" alone should not beat three changeover words.
  const goalHits = (g: { keys: string[] }) => g.keys.filter((k) => lower.includes(k.toLowerCase())).length;
  const goal = ctx.goals.reduce<(typeof ctx.goals)[number] | null>((b, g) => (goalHits(g) > (b ? goalHits(b) : 0) ? g : b), null);
  const route = propose(text, ctx.routes)?.route ?? null;
  const amount = amountEur(text);
  const spends = SPEND.test(text);
  const sameAs = closest(text, ctx.cases.filter((c) => c.open), (c) => c.title);
  const people = idea.affected.length;

  const fit = part("fit", [
    hit(!!goal, 60, goal ? "Serves “" + goal.goal + "”" : "", "Which company goal does it serve?"),
    hit(MEASURE.test(text), 25, "Names what it measures", "Which number would move?"),
    hit(!!goal && QUANTITY.test(text), 15, "Puts a figure on the goal", "How far would it move that number?"),
  ]);
  const impact = part("impact", [
    hit(QUANTITY.test(text), 40, "Upside has a number", "Put a number on the upside (minutes, €, %)."),
    hit(people > 0, Math.min(30, people * 10), people + (people === 1 ? " more person affected" : " more people affected"), "Add who else it helps (Affected)."),
    hit(REACH.test(text), 15, "Reaches beyond one person", "Does it help one team, or every shift?"),
    hit(idea.attachments > 0, 15, "Evidence attached", "Attach a photo or a screenshot as evidence."),
  ]);
  const feasibility = part("feasibility", [
    hit(!!route, 35, route ? "Decided by the owner of “" + route.type + "”" : "", "Who would decide this?"),
    !spends ? { points: 25, found: "No spend needed" }
      : amount !== null && amount <= ctx.spendLimitEur ? { points: 25, found: "Within team authority (≤ €" + ctx.spendLimitEur.toLocaleString("en") + ")" }
      : amount !== null ? { points: 10, found: "Above team authority - needs a sign-off" }
      : { points: 0, missing: "Roughly what would it cost?" },
    hit(FIRST_STEP.test(text), 40, "Names a first step", "What is the smallest first step - a pilot, a one-week trial?"),
  ]);
  const clarity = part("clarity", [
    hit(!sameAs, 40, "Not raised before", sameAs ? "Already raised: “" + sameAs.title + "” - co-sign it instead?" : undefined),
    hit(n >= 12, 20, "Described in more than a line", "Say a little more: what exactly would change?"),
    hit(n >= 30, 10, "Detailed", undefined),
    hit(WHY.test(text), 15, "Says why", "Why does it matter - what happens today?"),
    hit(WHO.test(text) || people > 0, 15, "Says who it is for", "Who works differently afterwards?"),
  ]);

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
