// Better, same or worse: computed from the baseline and the measured number, never typed in.
// "Every number can be checked": the arithmetic is this file, nothing else.
import type { Baseline, VerdictWord } from "./types";

export type Verdict = { verdict: VerdictWord; changePct: number | null };

/** The measured `value` against the baseline, with `tolerancePct` either way counted as "same". */
export function verdictOf(baseline: Baseline | null, value: number, tolerancePct: number): Verdict {
  if (!baseline || baseline.none || !Number.isFinite(value)) return { verdict: "not measured", changePct: null };
  const before = baseline.value;
  // A baseline of zero has no percent: any move is a whole change, judged by its direction.
  if (before === 0) {
    if (value === 0) return { verdict: "same", changePct: 0 };
    const up = value > 0;
    return { verdict: up === (baseline.better === "up") ? "better" : "worse", changePct: null };
  }
  const changePct = Math.round(((value - before) / Math.abs(before)) * 1000) / 10;
  if (Math.abs(changePct) <= tolerancePct) return { verdict: "same", changePct };
  const up = changePct > 0;
  return { verdict: up === (baseline.better === "up") ? "better" : "worse", changePct };
}
