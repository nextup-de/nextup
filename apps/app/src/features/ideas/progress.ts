// The evaluation under the first message, as it really runs (components/ideas/RaiseStart.tsx, `Evaluating`).
// Its phases are the turn's own work (lib/use-idea-studio.ts, app/api/[company]/ideas/turn): the draft is
// started, the server scores the idea and looks for a similar one (event `scores`), then the coach
// thinks (event `stage`) until its first words (event `text`). A phase ends only when its event arrives;
// meanwhile its bar fills against how long that phase took the last times on this browser.
// No React, no DOM: the hook keeps the times, the component draws them.

export const PHASES = ["draft", "score", "coach"] as const;
export type Phase = (typeof PHASES)[number];
export type Coach = "brain" | "model" | "offline";

// What is known so far: when each phase began (ms, the caller's clock), which coach answers, what scoring found.
export type Progress = {
  at: Partial<Record<Phase, number>>;
  coach: Coach | null;
  overall: number | null;
  threshold: number | null;
  similar: string | null; // the title of the closest known case, once scored
};

// Expected ms per phase, the coach's per kind - it is the wait that differs most.
export type Timings = Record<string, number>;
export const DEFAULT_TIMINGS: Timings = { draft: 700, score: 1200, "coach:brain": 9000, "coach:model": 6000, "coach:offline": 300, coach: 6000 };
const MIN_MS = 100, MAX_MS = 90_000;

export const startProgress = (now: number): Progress => ({ at: { draft: now }, coach: null, overall: null, threshold: null, similar: null });

// The phase under way: the last one that has begun.
export const phaseOf = (p: Progress): Phase => [...PHASES].reverse().find((x) => p.at[x] !== undefined) ?? "draft";
export const phaseIndex = (p: Progress) => PHASES.indexOf(phaseOf(p));

const keyOf = (phase: Phase, coach: Coach | null) => (phase === "coach" && coach ? "coach:" + coach : phase);
export const expectedMs = (t: Timings, phase: Phase, coach: Coach | null) => t[keyOf(phase, coach)] ?? DEFAULT_TIMINGS[keyOf(phase, coach)] ?? DEFAULT_TIMINGS[phase];

// One phase measured: the expected time moves towards it (a running average, so one slow answer does not set the next wait).
export function learn(t: Timings, phase: Phase, coach: Coach | null, ms: number): Timings {
  if (!Number.isFinite(ms) || ms < 0) return t;
  const k = keyOf(phase, coach);
  const prev = expectedMs(t, phase, coach);
  return { ...t, [k]: Math.round(Math.min(MAX_MS, Math.max(MIN_MS, prev * 0.6 + ms * 0.4))) };
}

// How full a running phase's bar is: about 80% at the expected time, then creeping towards 95% - never full
// before the work is done, never standing still.
export const fill = (elapsed: number, expected: number) => (elapsed <= 0 ? 0 : 0.95 * (1 - Math.exp((-1.6 * elapsed) / Math.max(1, expected))));

// Each phase's bar: done ones full, the one under way by `fill`, the rest empty.
export function bars(p: Progress, now: number, t: Timings): number[] {
  const cur = phaseIndex(p);
  return PHASES.map((ph, i) => (i < cur ? 1 : i > cur ? 0 : fill(now - (p.at[ph] ?? now), expectedMs(t, ph, p.coach))));
}

// About how long is left, in ms: the rest of the phase under way and the phases still to come, by the
// expected times. null once the phase under way has run past its expected time - then no guess is honest.
export function remaining(p: Progress, now: number, t: Timings): number | null {
  const cur = phaseIndex(p), ph = PHASES[cur];
  const left = expectedMs(t, ph, p.coach) - (now - (p.at[ph] ?? now));
  if (left < 0) return null;
  return PHASES.slice(cur + 1).reduce((sum, x) => sum + expectedMs(t, x, p.coach), left);
}

// The times measured when a phase begins: the one before it is finished.
export function finished(p: Progress, next: Phase, now: number): { phase: Phase; ms: number } | null {
  const i = PHASES.indexOf(next);
  const prev = i > 0 ? PHASES[i - 1] : null;
  const began = prev ? p.at[prev] : undefined;
  return prev && began !== undefined && p.at[next] === undefined ? { phase: prev, ms: now - began } : null;
}
