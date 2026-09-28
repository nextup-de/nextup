// Suggested answers under the coach's question: whole sentences the author can send as they are
// or edit first. Built from the company's own facts (its goals, its routing map, the team spend
// limit), and each one is re-scored before it is offered - a suggestion that would not move the
// score is never shown, and the gain shown next to it is the real one. Pure.
import { words } from "@/features/evaluate";
import { proposeRoute } from "@/features/routing";
import { benchmark, weakest, type Benchmark, type BenchmarkContext, type BenchmarkId, type IdeaInput } from "./benchmarks";

export type Reply = { id: BenchmarkId; text: string; gain: number };

const MAX_REPLIES = 3;

// Items in `list` ordered by how many words they share with the idea, best first; ties keep order.
function byOverlap<T>(idea: string, list: readonly T[], of: (t: T) => string): T[] {
  const w = new Set(words(idea));
  const hits = (t: T) => words(of(t)).filter((x) => w.has(x)).length;
  return [...list].map((t, i) => ({ t, i, h: hits(t) })).sort((a, b) => b.h - a.h || a.i - b.i).map((x) => x.t);
}

function candidates(idea: IdeaInput, now: Benchmark, ctx: BenchmarkContext): { id: BenchmarkId; text: string }[] {
  const out: { id: BenchmarkId; text: string }[] = [];
  // The idea's own words plus those of the route it touches: "change IT" finds the IT route, and
  // through its words (access, login, account) the goal about new hires, not the scrap goal.
  const near = proposeRoute(idea.text.toLowerCase() + " ", ctx.routes);
  const about = idea.text + " " + (near ? near.type + " " + near.keys.join(" ") : "");
  const goals = byOverlap(about, ctx.goals, (g) => g.goal + " " + g.keys.join(" "));
  const has = (id: BenchmarkId, found: string) => now.parts.some((p) => p.id === id && p.found.some((f) => f.startsWith(found)));
  if (!has("fit", "Serves")) for (const g of goals.slice(0, 2)) out.push({ id: "fit", text: `It serves our goal “${g.goal}”.` });
  out.push({ id: "fit", text: "The number that moves: about 2 hours per week we lose on this today." });

  out.push({ id: "impact", text: "It would save about 30 minutes per shift, for every shift in our team." });
  out.push({ id: "impact", text: "It helps the whole team, not just me." });

  // The routes closest to the idea, named by what they own (their titles carry their own keywords).
  const routes = byOverlap(about, ctx.routes, (r) => r.type + " " + r.keys.join(" "));
  if (!has("feasibility", "Decided by")) for (const r of routes.slice(0, 2)) out.push({ id: "feasibility", text: `The owner of “${r.type}” would decide this.` });
  const cost = now.parts.find((p) => p.id === "feasibility")?.missing.some((m) => m.includes("cost"));
  if (cost) out.push({ id: "feasibility", text: `It would cost roughly €${Math.round(ctx.spendLimitEur * 0.4).toLocaleString("en")} - within team authority.` });
  out.push({ id: "feasibility", text: "First step: a one-week pilot with one team, then we decide on the rollout." });

  out.push({ id: "clarity", text: "It matters because today we lose time on this every week, and it avoids the same workaround again and again." });
  return out;
}

// Up to three answers that each raise the score, at most one per bar so the author gets a real
// choice. Within a bar the most relevant candidate wins (the order above), not the biggest gain;
// across bars the one the coach just asked about comes first, then the biggest gain.
export function suggestReplies(idea: IdeaInput, now: Benchmark, ctx: BenchmarkContext): Reply[] {
  const best = new Map<BenchmarkId, Reply>();
  for (const c of candidates(idea, now, ctx)) {
    if (best.has(c.id)) continue;
    const gain = benchmark({ ...idea, text: (idea.text + "\n" + c.text).trim() }, ctx).overall - now.overall;
    if (gain > 0) best.set(c.id, { ...c, gain });
  }
  const asked = weakest(now)?.id;
  return [...best.values()].sort((a, b) => Number(b.id === asked) - Number(a.id === asked) || b.gain - a.gain).slice(0, MAX_REPLIES);
}
