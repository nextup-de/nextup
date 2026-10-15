// What the app sends the brain after a decision (services/brain, brain/plan.py) and what it keeps of the
// answers: the first steps and the metric for an accepted idea, and the draft of a discussion's
// check-in. Pure - server/brain.ts posts them, redacted like every model call. Every answer is only a
// proposal: the lead adds the steps they want, the desk holder edits the check-in, nobody's number
// comes from the model.
import type { ReducedCase } from "@/features/cases/reducer";
import type { EventLog } from "@/features/cases/events";
import { commentsOn } from "@/features/cases/selectors";

const clip = (s: string, n: number) => (s.length > n ? s.slice(0, n - 1) + "…" : s);

export type PlanRequest = { company: string; idea: { title: string; body: string }; goals: { name: string; kpi: string }[] };
export type PlanProposal = { steps: string[]; metric: { name: string; unit: string; better: "up" | "down" } | null; version: string };

export function planRequest(company: string, idea: { title: string; body: string }, goals: readonly { goal: string }[]): PlanRequest {
  return {
    company: clip(company, 120),
    idea: { title: clip(idea.title.trim(), 300), body: clip(idea.body.trim(), 5000) },
    goals: goals.slice(0, 20).map((g) => ({ name: clip(g.goal, 200), kpi: "" })),
  };
}

export type CheckinRequest = {
  company: string; idea: { title: string; body: string }; missing: string;
  said: { who: string; text: string }[]; weak: string[]; round: number;
};
export type CheckinProposal = { next: "round" | "decide"; open: string[]; note: string; version: string };

/**
 * What was said in the round under way: the comments since the last check-in (or since the discussion
 * started), each with a role instead of a name - the author is "the author", someone in the org chart
 * their role, anyone else "a colleague".
 */
export function roundSaid(c: ReducedCase, log: EventLog, roleOf: (name: string) => string | null): { who: string; text: string }[] {
  const d = c.discussion;
  if (!d) return [];
  const since = d.rounds.length ? d.rounds[d.rounds.length - 1].day : d.startedDay;
  return commentsOn(log, c.id)
    .filter((m) => m.day >= since && !m.by.startsWith("system:"))
    .slice(-30)
    .map((m) => ({ who: m.by === c.from ? "the author" : roleOf(m.by) ?? "a colleague", text: clip(m.text, 2000) }));
}

export function checkinRequest(company: string, c: ReducedCase, said: { who: string; text: string }[], weak: readonly string[]): CheckinRequest {
  return {
    company: clip(company, 120),
    idea: { title: clip(c.title.trim(), 300), body: clip(c.body.trim(), 5000) },
    missing: clip(c.discussion?.missing ?? "", 500),
    said,
    weak: weak.slice(0, 10).map((w) => clip(w, 200)),
    round: Math.min(20, Math.max(1, c.discussion?.round ?? 1)),
  };
}

const norm = (s: string) => s.toLowerCase().replace(/[^a-z0-9äöüß]+/g, " ").trim();

/**
 * The brief's own step suggestions plus the brain's, labelled "AI" - minus what is on the board or
 * already suggested. The brief's lines come first: they are the author's words.
 */
export function withBrainSteps<H extends { label: string; text: string }>(hints: readonly H[], brain: readonly string[], board: readonly { text: string }[]): (H | { label: string; text: string })[] {
  const seen = new Set([...board.map((s) => norm(s.text)), ...hints.map((h) => norm(h.text))]);
  const extra = brain.filter((t) => { const k = norm(t); if (!k || seen.has(k)) return false; seen.add(k); return true; });
  return [...hints, ...extra.map((text) => ({ label: "AI", text }))];
}
