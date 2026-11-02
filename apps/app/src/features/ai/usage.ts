// What the assistant costs: Anthropic list prices in US dollars per million tokens (AID D4).
export const AI_PRICES_USD_PER_MTOK: Record<string, { in: number; out: number }> = {
  "claude-haiku-5-5": { in: 0.1, out: 0.5 },
  "claude-sonnet-5-5": { in: 2, out: 10 },
  "claude-opus-5-5": { in: 4, out: 20 },
};

/**
 * Estimated cost in US dollars, rounded to 4 decimals; null for a model without a price.
 * An upper bound: tokensIn includes cache reads and writes, and all of it is priced as uncached input.
 */
export function aiCost(model: string, tokensIn: number, tokensOut: number): number | null {
  if (model === "" || model === "mock") return 0;
  const key = Object.keys(AI_PRICES_USD_PER_MTOK).find((k) => model.includes(k));
  if (!key) return null;
  const p = AI_PRICES_USD_PER_MTOK[key];
  return Math.round(((tokensIn * p.in + tokensOut * p.out) / 1_000_000) * 10_000) / 10_000;
}
