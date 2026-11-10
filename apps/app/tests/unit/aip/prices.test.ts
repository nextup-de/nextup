// Decision Q7.5: a price per model in the AI settings, and a token limit for models without one.
import { describe, expect, it } from "vitest";
import { spendOf, tokenLevel, tokenShare, tokensReached, usedUpBy, tokenCapOf, DEFAULT_MONTHLY_TOKEN_CAP, MAX_MONTHLY_TOKEN_CAP } from "@/features/ai/budget";
import { aiGate } from "@/features/ai/gate";
import { costAt, parsePriceLines, priceFor, priceLines, pricesOf, MAX_PRICES } from "@/features/ai/prices";
import { aiSettings, type AiSettings } from "@/features/ai/settings";

const AZURE = "gpt-4.1-mini-2025-04-14";

describe("prices typed on the connectors form", () => {
  it("one model per line: name, input, output; a decimal point or comma; names lower case", () => {
    expect(parsePriceLines("gpt-4.1-mini 0.42 1.68\n\n  Mistral-Nemo\t0 0  \nclaude-x 2,5 10")).toEqual({
      ok: true,
      prices: { "gpt-4.1-mini": { in: 0.42, out: 1.68 }, "mistral-nemo": { in: 0, out: 0 }, "claude-x": { in: 2.5, out: 10 } },
    });
    expect(parsePriceLines("")).toEqual({ ok: true, prices: {} });
    expect(parsePriceLines("a 1 1\na 2 2")).toEqual({ ok: true, prices: { a: { in: 2, out: 2 } } });
  });

  it("a line that does not read is refused by its number", () => {
    expect(parsePriceLines("gpt 1 1\ngpt-4.1-mini 0.42")).toEqual({ ok: false, line: 2 });
    expect(parsePriceLines("gpt -1 1")).toEqual({ ok: false, line: 1 });
    expect(parsePriceLines("gpt 1 abc")).toEqual({ ok: false, line: 1 });
    expect(parsePriceLines("gpt 1.12345 1")).toEqual({ ok: false, line: 1 });
    expect(parsePriceLines("gpt 10001 1")).toEqual({ ok: false, line: 1 });
    expect(parsePriceLines("two words 1 1")).toEqual({ ok: false, line: 1 });
    // Thousands or decimals? Refused, not guessed.
    expect(parsePriceLines("gpt 1.000 2")).toEqual({ ok: false, line: 1 });
    expect(parsePriceLines("gpt 2 1,500")).toEqual({ ok: false, line: 1 });
    expect(parsePriceLines("gpt 0.042 1.5")).toEqual({ ok: true, prices: { gpt: { in: 0.042, out: 1.5 } } });
    const many = Array.from({ length: MAX_PRICES + 1 }, (_, i) => `m${i} 1 1`).join("\n");
    expect(parsePriceLines(many)).toEqual({ ok: false, line: MAX_PRICES + 1 });
  });

  it("names as providers report them: paths, @-ids, tags, ARNs", () => {
    expect(parsePriceLines("/models/Mistral-Nemo 0 0\n@cf/meta/llama-3-8b 0.1 0.2\nmistral-nemo:latest 0 0")).toEqual({
      ok: true,
      prices: { "/models/mistral-nemo": { in: 0, out: 0 }, "@cf/meta/llama-3-8b": { in: 0.1, out: 0.2 }, "mistral-nemo:latest": { in: 0, out: 0 } },
    });
    expect(priceFor("arn:aws:bedrock:eu-central-1::foundation-model/x", { "arn:aws:bedrock:eu-central-1::foundation-model/x": { in: 1, out: 1 } })).toEqual({ in: 1, out: 1 });
  });

  it("back to the form's text, sorted, and the stored map read with bad entries dropped", () => {
    expect(priceLines({ b: { in: 1, out: 2 }, a: { in: 0.42, out: 1.68 } })).toBe("a 0.42 1.68\nb 1 2");
    expect(priceLines(undefined)).toBe("");
    expect(pricesOf({ "GPT-4.1-mini": { in: 0.42, out: 1.68 }, bad: { in: -1, out: 1 }, worse: "x", "": { in: 1, out: 1 } })).toEqual({ "gpt-4.1-mini": { in: 0.42, out: 1.68 } });
    expect(pricesOf(null)).toEqual({});
    expect(pricesOf([1, 2])).toEqual({});
  });
});

describe("which price a recorded name gets", () => {
  const prices = { "gpt-4.1": { in: 2, out: 8 }, "gpt-4.1-mini": { in: 0.42, out: 1.68 } };
  it("the name the provider reports contains the typed one; the longest typed name wins; case does not matter", () => {
    expect(priceFor(AZURE, prices)).toEqual({ in: 0.42, out: 1.68 });
    expect(priceFor("GPT-4.1-2025-04-14", prices)).toEqual({ in: 2, out: 8 });
    expect(priceFor("mistral-nemo", prices)).toBeNull();
    expect(priceFor("", prices)).toBeNull();
    expect(priceFor(AZURE, undefined)).toBeNull();
  });
  it("cost in euros for the tokens, 4 decimals", () => {
    expect(costAt({ in: 0.42, out: 1.68 }, 1_000_000, 500_000)).toBe(1.26);
  });
});

describe("the month's spend with company prices", () => {
  const rows = [
    { model: AZURE, tokensIn: 10_000_000, tokensOut: 1_000_000 },
    { model: "eu.anthropic.claude-sonnet-5-5", tokensIn: 1_000_000, tokensOut: 1_000_000 }, // list: 2 + 10
    { model: "mistral-nemo", tokensIn: 3_000_000, tokensOut: 1_000_000 },
  ];
  it("a model with a company price is counted in euros, at that price", () => {
    expect(spendOf(rows, { "gpt-4.1-mini": { in: 0.4, out: 1.6 } })).toEqual({ spentEur: 4 + 1.6 + 12, unpriced: ["mistral-nemo"], tokensUnpriced: 4_000_000 });
  });
  it("without one its tokens are summed for the token limit", () => {
    expect(spendOf(rows)).toEqual({ spentEur: 12, unpriced: ["gpt-4.1-mini-2025-04-14", "mistral-nemo"], tokensUnpriced: 15_000_000 });
  });
  it("the company price wins over the list price; a price of 0 makes a model free, not unknown", () => {
    expect(spendOf(rows, { "claude-sonnet-5-5": { in: 1, out: 1 }, "mistral-nemo": { in: 0, out: 0 }, "gpt-4.1-mini": { in: 0, out: 0 } })).toEqual({ spentEur: 2, unpriced: [], tokensUnpriced: 0 });
  });
});

describe("the token limit", () => {
  it("the stored limit, or 20 million; whole tokens up to two billion", () => {
    expect(DEFAULT_MONTHLY_TOKEN_CAP).toBe(20_000_000);
    expect([null, undefined, -5, Number.NaN].map(tokenCapOf)).toEqual(Array(4).fill(20_000_000));
    expect(tokenCapOf(0)).toBe(0);
    expect(tokenCapOf(1234.9)).toBe(1234);
    expect(tokenCapOf(1e12)).toBe(MAX_MONTHLY_TOKEN_CAP);
  });
  it("levels at 70, 90 and 100 % of the limit; nothing to count is never reached, also at a limit of 0", () => {
    const at = (tokensUnpriced: number, tokenCap = 1000) => ({ tokensUnpriced, tokenCap });
    expect([0, 699, 700, 899, 900, 999, 1000].map((n) => tokenLevel(at(n)))).toEqual(["ok", "ok", "warn70", "warn70", "warn90", "warn90", "reached"]);
    expect(tokenShare(at(570))).toBe(57);
    expect(tokensReached(at(0, 0))).toBe(false);
    expect(tokenShare(at(0, 0))).toBe(0);
    expect(tokensReached(at(1, 0))).toBe(true);
  });
  it("the euro cap is named first when both are used up", () => {
    expect(usedUpBy({ capEur: 50, spentEur: 60, tokensUnpriced: 2, tokenCap: 1 })).toBe("budget");
    expect(usedUpBy({ capEur: 50, spentEur: 10, tokensUnpriced: 2, tokenCap: 1 })).toBe("tokens");
    expect(usedUpBy({ capEur: 50, spentEur: 10, tokensUnpriced: 0, tokenCap: 1 })).toBeNull();
  });
});

describe("the gate and the token limit", () => {
  const azure: AiSettings = { choice: "azure-openai", region: "eu-central-1", model: "gpt-4.1-mini", endpoint: "https://x.example", deployment: "d", prices: undefined };
  const real = { stage: "pilot", hasDatabase: true, settings: azure, dpaSignedAt: new Date("2026-10-01"), purpose: "assist" as const, assistantOn: true, aiRouting: true };
  it("closes for every purpose when the models without a price used their limit, and says so", () => {
    const budget = { capEur: 50, spentEur: 0, tokensUnpriced: 20_000_000, tokenCap: 20_000_000 };
    for (const purpose of ["assist", "routing", "coach", "brain"] as const) {
      expect(aiGate({ ...real, purpose, budget })).toEqual({ on: false, why: expect.stringContaining("token limit") });
    }
    expect(aiGate({ ...real, budget: { ...budget, tokensUnpriced: 19_999_999 } }).on).toBe(true);
  });
});

describe("prices in the AI settings", () => {
  it("are read from the row, lower case and checked, and absent when there are none", () => {
    const row = (prices: unknown) => ({ on: true, settings: { choice: "azure-openai", model: "gpt", endpoint: "https://x.example", deployment: "d", prices } });
    expect(aiSettings(row({ "GPT-4.1-mini": { in: 0.42, out: 1.68 } }), {}, "pilot").prices).toEqual({ "gpt-4.1-mini": { in: 0.42, out: 1.68 } });
    expect("prices" in aiSettings(row(null), {}, "pilot")).toBe(false);
    expect("prices" in aiSettings(row({ bad: { in: -1, out: 0 } }), {}, "pilot")).toBe(false);
  });
});
