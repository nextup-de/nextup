// The coach with the brain (services/brain /v1/coach): the grilling - the first open point in the
// order problem, context, evidence, impact, solution, risks, success - one question per turn, and
// the brain's own best-guess answer. The pure half: what goes out, and how the answer becomes the
// coach's message and a suggested answer. The call is src/server/brain.ts. Pure.
//
// The numbers stay the app's: the brain gets coachBrief() and may not restate a score, and its
// suggestion is re-scored like every other before it is shown (features/ideas/replies).
import type { Turn } from "@/features/assist/draft";
import type { BrainItem } from "@/features/routing/brain";
import { weakest, type Benchmark, type BenchmarkContext, type IdeaInput } from "./benchmarks";
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
// edits it anyway). Offered, source "ai", whenever it is a real sentence and not a duplicate of an
// offered text - no gain check (HD16: a model's text is never ranked or filtered by score). It
// answers the question just asked, so it goes first.
export function withCoachSuggestion(a: CoachAnswer, _idea: IdeaInput, now: Benchmark, _ctx: BenchmarkContext, replies: readonly Reply[]): Reply[] {
  const text = a.recommended.replace(/^\s*for example:\s*/i, "").replace(/^['"“]+|['"”]+$/g, "").trim();
  if (text.length < 8) return [...replies];
  const same = (t: string) => t.trim().toLowerCase() === text.toLowerCase();
  if (replies.some((r) => same(r.text))) return [...replies];
  const id = weakest(now)?.id ?? "clarity";
  return [{ id, text, source: "ai" as const }, ...replies.filter((r) => r.id !== id)].slice(0, MAX_REPLIES);
}
