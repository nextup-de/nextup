// The company's own rules for everything after the routing (docs/plans/2026-10-15_idea-to-project.md):
// how often a discussion checks in, when a project is measured, and how an idea is rewarded.
// Stored on CompanyConfig, edited in the company's /admin; the reducer and the pages read them
// through Seed.loop, so a company without a row (or without a database) gets the defaults below.
//
// Pure: no Prisma, no React. Every value is clamped here so a bad row can never stop the clock.

export type RewardKind = "none" | "thanks" | "fixed" | "share";

/** What the company gives the author(s) once a project is measured. NextUp records it; payroll pays it. */
export type RewardRule = {
  kind: RewardKind;
  /** kind "fixed": the amount in euros. */
  amount: number | null;
  /** kind "share": a percent of the measured yearly saving... */
  sharePct: number | null;
  /** ...up to this many euros. */
  capEur: number | null;
};

export type LoopRules = {
  /** A discussion checks in this many days after it started, and after each check-in. */
  discussEveryDays: number;
  /** After this many rounds the decision is due; one more round needs a manager. */
  discussMaxRounds: number;
  /** The measure checks, in days after the project is done. */
  measureDays: number[];
  /** Within this many percent of the baseline, the verdict is "same". */
  tolerancePct: number;
  /** An idea that costs less than this (the team's spend authority) may skip the discussion. */
  fastLaneEur: number;
  reward: RewardRule;
};

export const LOOP_DEFAULTS: LoopRules = {
  discussEveryDays: 3,
  discussMaxRounds: 3,
  measureDays: [30, 90],
  tolerancePct: 2,
  fastLaneEur: 5000,
  reward: { kind: "thanks", amount: null, sharePct: null, capEur: null },
};

const REWARD_KINDS: readonly RewardKind[] = ["none", "thanks", "fixed", "share"];

const int = (v: unknown, min: number, max: number, fallback: number): number =>
  typeof v === "number" && Number.isFinite(v) ? Math.min(max, Math.max(min, Math.round(v))) : fallback;

const euros = (v: unknown): number | null =>
  typeof v === "number" && Number.isFinite(v) && v >= 0 ? Math.round(v) : null;

/** Any partial rules (a CompanyConfig row, a seed, a form) -> complete, sane rules. */
export function loopRules(p?: Partial<LoopRules> | null): LoopRules {
  const d = LOOP_DEFAULTS;
  if (!p) return d;
  const days = Array.isArray(p.measureDays)
    ? [...new Set(p.measureDays.map((n) => int(n, 1, 730, 0)).filter((n) => n > 0))].sort((a, b) => a - b).slice(0, 4)
    : d.measureDays;
  const r: Partial<RewardRule> = p.reward ?? {};
  return {
    discussEveryDays: int(p.discussEveryDays, 1, 30, d.discussEveryDays),
    discussMaxRounds: int(p.discussMaxRounds, 1, 10, d.discussMaxRounds),
    measureDays: days.length ? days : d.measureDays,
    tolerancePct: int(p.tolerancePct, 0, 50, d.tolerancePct),
    fastLaneEur: int(p.fastLaneEur, 0, 10_000_000, d.fastLaneEur),
    reward: {
      kind: REWARD_KINDS.includes(r.kind as RewardKind) ? (r.kind as RewardKind) : d.reward.kind,
      amount: euros(r.amount),
      sharePct: r.sharePct == null ? null : int(r.sharePct, 0, 100, 0),
      capEur: euros(r.capEur),
    },
  };
}

/** The reward a rule suggests. `yearlySaving` in euros, when the measure gives one. */
export function suggestedReward(rule: RewardRule, yearlySaving: number | null): number | null {
  if (rule.kind === "fixed") return rule.amount;
  if (rule.kind !== "share" || rule.sharePct == null || yearlySaving == null || yearlySaving <= 0) return null;
  const share = Math.round((yearlySaving * rule.sharePct) / 100);
  return rule.capEur != null ? Math.min(share, rule.capEur) : share;
}
