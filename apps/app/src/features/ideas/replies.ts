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
  const spend = Math.round(ctx.spendLimitEur * 0.4).toLocaleString("en");

  // Whole answers, the way a colleague would actually write them: a claim, the figure behind it,
  // and where the figure comes from - each still carries the facts the benchmarks check for.
  if (!has("fit", "Serves")) for (const g of goals.slice(0, 2)) out.push({ id: "fit", text: `It serves our goal “${g.goal}” - that is the number my team lead reports on every month, and this is one of the things that quietly works against it today.` });
  out.push({ id: "fit", text: "The number that moves is the time we lose on this today: roughly 2 hours per week across the team, spread over small waits that nobody measures because each one is only a few minutes." });

  out.push({ id: "impact", text: "In practice it would save about 30 minutes per shift, and since every shift on the line runs into the same thing, that adds up to roughly 10 hours a week for the whole team - I counted it over the last two weeks." });
  out.push({ id: "impact", text: "It is not just my station: every shift and both lines run into the same problem, so the whole team would work differently afterwards, and the new hires would not have to learn the workaround at all." });

  // The routes closest to the idea, named by what they own (their titles carry their own keywords).
  const routes = byOverlap(about, ctx.routes, (r) => r.type + " " + r.keys.join(" "));
  if (!has("feasibility", "Decided by")) for (const r of routes.slice(0, 2)) out.push({ id: "feasibility", text: `The owner of “${r.type}” would decide this; nothing outside their area has to change for a first version, so it should not need anyone above them.` });
  const cost = now.parts.find((p) => p.id === "feasibility")?.missing.some((m) => m.includes("cost"));
  if (cost) out.push({ id: "feasibility", text: `It would cost roughly €${spend} for the first version, which is within team authority - so the team lead can decide it without a sign-off from controlling, and we only spend more if the pilot holds up.` });
  out.push({ id: "feasibility", text: "First step: a one-week pilot with one team on one line, with the old way kept as a fallback, so nobody is stuck if it does not work; after that week we compare the two and decide on the rollout together." });

  out.push({ id: "clarity", text: "It matters because today we lose time on this every single week, and each time we build the same workaround again instead of fixing it once - the waiting is what people complain about most, and it never gets written down anywhere." });
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
