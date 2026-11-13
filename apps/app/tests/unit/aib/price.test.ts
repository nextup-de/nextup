// AIB-Z2: aiCost prices the chosen provider's model with the prices of its recorded eval run.
import { describe, expect, it } from "vitest";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { aiCost, AI_PRICES_USD_PER_MTOK } from "@/features/ai/usage";

const RECORDED = join(__dirname, "../../../../../services/brain/eval/recorded");
const read = <T>(f: string): T => JSON.parse(readFileSync(join(RECORDED, f), "utf8")) as T;
const chosen = read<{ provider: string; model: string }>("chosen.json");
const record = read<{ model: string; usd_per_mtok: { in: number; out: number }; tokens_in: number; tokens_out: number; cost_usd: number }>(
  `${chosen.provider}.json`,
);

describe("AIB price", () => {
  it("has a row for the chosen model with the recorded prices", () => {
    const key = Object.keys(AI_PRICES_USD_PER_MTOK).find((k) => chosen.model.includes(k));
    expect(key).toBeDefined();
    expect(AI_PRICES_USD_PER_MTOK[key!]).toEqual(record.usd_per_mtok);
  });

  it("prices the recorded run at its recorded cost", () => {
    expect(aiCost(chosen.model, record.tokens_in, record.tokens_out)).toBeCloseTo(record.cost_usd, 4);
  });

  it("prices a million input and a million output tokens at the list price", () => {
    expect(aiCost(chosen.model, 1_000_000, 0)).toBe(0.484);
    expect(aiCost(chosen.model, 0, 1_000_000)).toBe(1.936);
  });

  it("leaves the Claude rows as they were", () => {
    expect(aiCost("anthropic.claude-haiku-5-5", 1_000_000, 1_000_000)).toBe(0.6);
  });
});
