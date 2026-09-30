// The coach with the brain (services/brain /v1/coach): the grilling - the first open point in the
// order problem, context, evidence, impact, solution, risks, success - one question per turn, and
// the brain's own best-guess answer. The pure half: what goes out, and how the answer becomes the
// coach's message and a suggested answer. The call is src/server/brain.ts. Pure.
//
// The numbers stay the app's: the brain gets coachBrief() and may not restate a score, and its
// suggestion is re-scored like every other before it is shown (features/ideas/replies).
import type { Turn } from "@/features/assist/draft";
import type { BrainItem } from "@/features/routing/brain";
import { benchmark, weakest, type Benchmark, type BenchmarkContext, type IdeaInput } from "./benchmarks";
import type { Reply } from "./replies";

export type CoachAnswer = {
  open_point: string; earlier_id: string | null;
  note: string; question: string; why: string; recommended: string;
  model: string; version: string;
};

export const COACH_MAX_HISTORY = 20; // the brain's own limit (services/brain/brain/schemas.py)
const MAX_REPLIES = 3; // as many suggested answers as features/ideas/replies offers

const clip = (s: string, n: number) => (s.length > n ? s.slice(0, n - 1) + "…" : s);

export function coachRequest(
  company: string, idea: { title: string; body: string }, turns: readonly Turn[], brief: string, known: readonly BrainItem[],
) {
  return {
    company: clip(company, 120),
    idea: { title: clip(idea.title.trim(), 300), body: clip(idea.body.trim(), 5000) },
    history: turns.slice(-COACH_MAX_HISTORY).map((t) => ({ role: t.role, text: clip(t.text, 4000) })),
    brief: clip(brief, 3000),
    known: known.slice(0, 80),
  };
}

// The coach's message in the studio's shape: what it noticed, then the one question and why the
// person who decides will ask it.
export function coachText(a: CoachAnswer): string {
  const ask = [a.question, a.why].map((s) => s.trim()).filter(Boolean).join(" ");
  return [a.note.trim(), ask].filter(Boolean).join("\n\n");
}

// The brain's best guess as a suggested answer: "For example:" and quotes dropped (the author
// edits it anyway), re-scored, and only offered when it would really move the score - the same
// rule as every other suggestion. It answers the question just asked, so it goes first.
export function withCoachSuggestion(a: CoachAnswer, idea: IdeaInput, now: Benchmark, ctx: BenchmarkContext, replies: readonly Reply[]): Reply[] {
  const text = a.recommended.replace(/^\s*for example:\s*/i, "").replace(/^['"“]+|['"”]+$/g, "").trim();
  if (text.length < 8) return [...replies];
  const gain = benchmark({ ...idea, text: (idea.text + "\n" + text).trim() }, ctx).overall - now.overall;
  if (gain <= 0) return [...replies];
  const id = weakest(now)?.id ?? "clarity";
  return [{ id, text, gain }, ...replies.filter((r) => r.id !== id)].slice(0, MAX_REPLIES);
}
