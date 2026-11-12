// What the assistant costs: list prices in US dollars per million tokens (AID D4). A model matches the first key its
// name contains.
export const AI_PRICES_USD_PER_MTOK: Record<string, { in: number; out: number }> = {
  "claude-haiku-5-5": { in: 0.1, out: 0.5 },
  "claude-sonnet-5-5": { in: 2, out: 10 },
  "claude-opus-5-5": { in: 4, out: 20 },
  // Azure OpenAI, EU data zone: the prices of the recorded eval run of 2026-11-05, chosen for the pilot on 2026-11-12
  // (AIB-Z2, docs/ops/AI_PROVIDER.md "Result").
  "gpt-4.1-mini": { in: 0.484, out: 1.936 },
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
