// Suggested answers under the coach's question: whole sentences the author can send as they are
// or edit first. Built from the company's own facts (its goals, its routing map, the team spend
// limit) and offered for a bar that still has a missing part. They are not ranked or filtered by
// score gain (HD16): the order is the bar the coach asked, then the fixed bar order; each says
// where it came from (`source`). Pure.
import { words } from "@/features/evaluate";
import { proposeRoute } from "@/features/routing";
import { DEFAULT_LOCALE, translate, type Locale, type MessageKey } from "@/i18n";
import { formatEuro } from "@/i18n/format";
import { weakest, type Benchmark, type BenchmarkContext, type BenchmarkId, type IdeaInput } from "./benchmarks";

export type Reply = { id: BenchmarkId; text: string; source: "company" | "ai" };

const MAX_REPLIES = 3;
const BAR_ORDER: readonly BenchmarkId[] = ["fit", "impact", "feasibility", "clarity"];

// Items in `list` ordered by how many words they share with the idea, best first; ties keep order.
function byOverlap<T>(idea: string, list: readonly T[], of: (t: T) => string): T[] {
  const w = new Set(words(idea));
  const hits = (t: T) => words(of(t)).filter((x) => w.has(x)).length;
  return [...list].map((t, i) => ({ t, i, h: hits(t) })).sort((a, b) => b.h - a.h || a.i - b.i).map((x) => x.t);
}

function candidates(idea: IdeaInput, now: Benchmark, ctx: BenchmarkContext, locale: Locale): { id: BenchmarkId; text: string }[] {
  const t = (key: MessageKey, params?: Record<string, string | number>) => translate(locale, key, params);
  const out: { id: BenchmarkId; text: string }[] = [];
  // The idea's own words plus those of the route it touches: "change IT" finds the IT route, and
  // through its words (access, login, account) the goal about new hires, not the scrap goal.
  const near = proposeRoute(idea.text.toLowerCase() + " ", ctx.routes);
  const about = idea.text + " " + (near ? near.type + " " + near.keys.join(" ") : "");
  const goals = byOverlap(about, ctx.goals, (g) => g.goal + " " + g.keys.join(" "));
  // A finding of the benchmark starts with the words of its catalog text (before the first placeholder).
  const has = (id: BenchmarkId, found: MessageKey) => now.parts.some((p) => p.id === id && p.found.some((f) => f.startsWith(t(found).split("{")[0])));
  const spend = ctx.spendLimitEur === null ? null : formatEuro(locale, Math.round(ctx.spendLimitEur * 0.4));

  // Whole answers, the way a colleague would actually write them: a claim, the figure behind it,
  // and where the figure comes from - each still carries the facts the benchmarks check for.
  if (!has("fit", "ideas.benchFoundServes")) for (const g of goals.slice(0, 2)) out.push({ id: "fit", text: t("ideas.repFitGoal", { goal: g.goal }) });
  out.push({ id: "fit", text: t("ideas.repFitNumber") });

  out.push({ id: "impact", text: t("ideas.repImpactSaving") });
  out.push({ id: "impact", text: t("ideas.repImpactReach") });

  // The routes closest to the idea, named by what they own (their titles carry their own keywords).
  const routes = byOverlap(about, ctx.routes, (r) => r.type + " " + r.keys.join(" "));
  if (!has("feasibility", "ideas.benchFoundDecider")) for (const r of routes.slice(0, 2)) out.push({ id: "feasibility", text: t("ideas.repDecider", { type: r.type }) });
  const cost = now.parts.find((p) => p.id === "feasibility")?.missing.some((m) => m === t("ideas.benchMissCost"));
  if (cost && spend !== null) out.push({ id: "feasibility", text: t("ideas.repCost", { amount: spend }) });
  out.push({ id: "feasibility", text: t("ideas.repStep") });

  out.push({ id: "clarity", text: t("ideas.repClarity") });
  return out;
}

// Up to three answers, at most one per bar, for bars that still have a missing part. Within a bar
// the most relevant candidate wins (the order above). Across bars the one the coach just asked
// about comes first, then the fixed bar order. Never sorted or filtered by score gain (HD16).
export function suggestReplies(idea: IdeaInput, now: Benchmark, ctx: BenchmarkContext, locale: Locale = DEFAULT_LOCALE): Reply[] {
  const open = new Set(now.parts.filter((p) => p.missing.length > 0).map((p) => p.id));
  const best = new Map<BenchmarkId, Reply>();
  for (const c of candidates(idea, now, ctx, locale)) {
    if (open.has(c.id) && !best.has(c.id)) best.set(c.id, { ...c, source: "company" });
  }
  const asked = weakest(now)?.id;
  const order = asked ? [asked, ...BAR_ORDER.filter((id) => id !== asked)] : BAR_ORDER;
  return order.flatMap((id) => best.get(id) ?? []).slice(0, MAX_REPLIES);
}
