// A company's monthly budget for model calls (decision Q7.3). Pure: the cap and what the month's calls cost in,
// the share and the level out. The gate (gate.ts) closes at the cap; /admin/assistant shows the level.
//
// A model is priced by the company's own price (prices.ts, decision Q7.5), else by the built-in list (usage.ts). A
// model with neither has no cost to count: its tokens are held to a monthly token cap of their own instead.
import { costAt, priceFor, type ModelPrices } from "./prices";
import { aiCost } from "./usage";

/** The cap of a company that has none of its own, in euros per calendar month. */
export const DEFAULT_MONTHLY_CAP_EUR = 50;
export const MAX_MONTHLY_CAP_EUR = 100_000;

/**
 * The prices (usage.ts) are US dollar list prices; the cap is in euros. One dollar is counted as one euro: an
 * upper bound while a euro buys more than a dollar, and one constant to change when that stops being true.
 */
export const EUR_PER_USD = 1;

/** The token cap of a company that has none of its own: input and output tokens of models without a price, per month. */
export const DEFAULT_MONTHLY_TOKEN_CAP = 20_000_000;
/** Below Postgres' INTEGER limit. */
export const MAX_MONTHLY_TOKEN_CAP = 2_000_000_000;

/** The shares of the cap, in percent, at which /admin/assistant warns. */
export const WARN_AT = [70, 90] as const;

export type AiBudget = {
  capEur: number;
  /** The month's estimated cost of every model with a price. */
  spentEur: number;
  /** Models that were called this month and have no price: their cost is unknown and not in `spentEur`. */
  unpriced: string[];
  /** The month's input and output tokens of the models in `unpriced`. */
  tokensUnpriced: number;
  tokenCap: number;
};

/** What the gate needs of the budget: both caps and both sums. Plain JSON, it also crosses to the console page. */
export type GateBudget = Pick<AiBudget, "capEur" | "spentEur" | "tokensUnpriced" | "tokenCap">;

export type BudgetLevel = "ok" | "warn70" | "warn90" | "reached";

/** The stored cap, or the default: a whole number of euros from 0 (no model call at all) up. */
export function capOf(stored: number | null | undefined): number {
  if (typeof stored !== "number" || !Number.isFinite(stored) || stored < 0) return DEFAULT_MONTHLY_CAP_EUR;
  return Math.min(Math.floor(stored), MAX_MONTHLY_CAP_EUR);
}

/** The stored token cap, or the default: a whole number of tokens from 0 up. */
export function tokenCapOf(stored: number | null | undefined): number {
  if (typeof stored !== "number" || !Number.isFinite(stored) || stored < 0) return DEFAULT_MONTHLY_TOKEN_CAP;
  return Math.min(Math.floor(stored), MAX_MONTHLY_TOKEN_CAP);
}

/** The first instant of the calendar month `now` is in, and of the next one (UTC). */
export function monthOf(now: Date): { from: Date; to: Date } {
  const y = now.getUTCFullYear();
  const m = now.getUTCMonth();
  return { from: new Date(Date.UTC(y, m, 1)), to: new Date(Date.UTC(y, m + 1, 1)) };
}

const round4 = (n: number) => Math.round(n * 10_000) / 10_000;

/**
 * What the month's calls cost, per model summed before. The company's price wins over the list price (it is what
 * the company pays, in euros); a model with neither is named, not guessed, and its tokens are summed.
 */
export function spendOf(
  byModel: readonly { model: string; tokensIn: number; tokensOut: number }[],
  prices: ModelPrices = {},
): Pick<AiBudget, "spentEur" | "unpriced" | "tokensUnpriced"> {
  let eur = 0;
  let usd = 0;
  let tokensUnpriced = 0;
  const unpriced: string[] = [];
  for (const m of byModel) {
    const own = priceFor(m.model, prices);
    if (own) {
      eur += costAt(own, m.tokensIn, m.tokensOut);
      continue;
    }
    const cost = aiCost(m.model, m.tokensIn, m.tokensOut);
    if (cost !== null) {
      usd += cost;
      continue;
    }
    unpriced.push(m.model);
    tokensUnpriced += m.tokensIn + m.tokensOut;
  }
  return { spentEur: round4(eur + usd * EUR_PER_USD), unpriced: [...new Set(unpriced)].sort(), tokensUnpriced };
}

/** Used up: nothing is left of the cap. A cap of 0 is used up from the first day. */
export const capReached = (b: Pick<AiBudget, "capEur" | "spentEur">): boolean => b.spentEur >= b.capEur;

/**
 * The token cap is used up. Only tokens of a model without a price count, so a cap of 0 lets the first such call
 * through and stops the next; a company whose models all have a price never reaches it.
 */
export const tokensReached = (b: Pick<AiBudget, "tokensUnpriced" | "tokenCap">): boolean => b.tokensUnpriced > 0 && b.tokensUnpriced >= b.tokenCap;

/** Which cap closes the gate, or null: the euro cap first. */
export function usedUpBy(b: GateBudget): "budget" | "tokens" | null {
  return capReached(b) ? "budget" : tokensReached(b) ? "tokens" : null;
}

/** The share of the cap that is spent, in whole percent, rounded down; 100 for a cap of 0. */
export function budgetShare(b: Pick<AiBudget, "capEur" | "spentEur">): number {
  if (b.capEur <= 0) return 100;
  return Math.floor((b.spentEur * 100) / b.capEur);
}

const levelAt = (share: number): BudgetLevel => (share >= WARN_AT[1] ? "warn90" : share >= WARN_AT[0] ? "warn70" : "ok");

export function budgetLevel(b: Pick<AiBudget, "capEur" | "spentEur">): BudgetLevel {
  return capReached(b) ? "reached" : levelAt(budgetShare(b));
}

/** The share of the token cap the unpriced models used, in whole percent, rounded down; 0 while there are none. */
export function tokenShare(b: Pick<AiBudget, "tokensUnpriced" | "tokenCap">): number {
  if (b.tokensUnpriced <= 0) return 0;
  if (b.tokenCap <= 0) return 100;
  return Math.floor((b.tokensUnpriced * 100) / b.tokenCap);
}

export function tokenLevel(b: Pick<AiBudget, "tokensUnpriced" | "tokenCap">): BudgetLevel {
  return tokensReached(b) ? "reached" : levelAt(tokenShare(b));
}
