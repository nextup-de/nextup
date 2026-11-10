// A company's monthly budget for model calls (decision Q7.3). Pure: the cap and what the month's calls cost in,
// the share and the level out. The gate (gate.ts) closes at the cap; /admin/assistant shows the level.
import { aiCost } from "./usage";

/** The cap of a company that has none of its own, in euros per calendar month. */
export const DEFAULT_MONTHLY_CAP_EUR = 50;
export const MAX_MONTHLY_CAP_EUR = 100_000;

/**
 * The prices (usage.ts) are US dollar list prices; the cap is in euros. One dollar is counted as one euro: an
 * upper bound while a euro buys more than a dollar, and one constant to change when that stops being true.
 */
export const EUR_PER_USD = 1;

/** The shares of the cap, in percent, at which /admin/assistant warns. */
export const WARN_AT = [70, 90] as const;

export type AiBudget = {
  capEur: number;
  /** The month's estimated cost of every model with a price. */
  spentEur: number;
  /** Models that were called this month and have no price: their cost is unknown and not in `spentEur`. */
  unpriced: string[];
};

export type BudgetLevel = "ok" | "warn70" | "warn90" | "reached";

/** The stored cap, or the default: a whole number of euros from 0 (no model call at all) up. */
export function capOf(stored: number | null | undefined): number {
  if (typeof stored !== "number" || !Number.isFinite(stored) || stored < 0) return DEFAULT_MONTHLY_CAP_EUR;
  return Math.min(Math.floor(stored), MAX_MONTHLY_CAP_EUR);
}

/** The first instant of the calendar month `now` is in, and of the next one (UTC). */
export function monthOf(now: Date): { from: Date; to: Date } {
  const y = now.getUTCFullYear();
  const m = now.getUTCMonth();
  return { from: new Date(Date.UTC(y, m, 1)), to: new Date(Date.UTC(y, m + 1, 1)) };
}

const round4 = (n: number) => Math.round(n * 10_000) / 10_000;

/** What the month's calls cost, per model summed before. A model without a price is named, not guessed. */
export function spendOf(byModel: readonly { model: string; tokensIn: number; tokensOut: number }[]): Pick<AiBudget, "spentEur" | "unpriced"> {
  let usd = 0;
  const unpriced: string[] = [];
  for (const m of byModel) {
    const cost = aiCost(m.model, m.tokensIn, m.tokensOut);
    if (cost === null) unpriced.push(m.model);
    else usd += cost;
  }
  return { spentEur: round4(usd * EUR_PER_USD), unpriced: [...new Set(unpriced)].sort() };
}

/** Used up: nothing is left of the cap. A cap of 0 is used up from the first day. */
export const capReached = (b: Pick<AiBudget, "capEur" | "spentEur">): boolean => b.spentEur >= b.capEur;

/** The share of the cap that is spent, in whole percent, rounded down; 100 for a cap of 0. */
export function budgetShare(b: Pick<AiBudget, "capEur" | "spentEur">): number {
  if (b.capEur <= 0) return 100;
  return Math.floor((b.spentEur * 100) / b.capEur);
}

export function budgetLevel(b: Pick<AiBudget, "capEur" | "spentEur">): BudgetLevel {
  if (capReached(b)) return "reached";
  const share = budgetShare(b);
  return share >= WARN_AT[1] ? "warn90" : share >= WARN_AT[0] ? "warn70" : "ok";
}
