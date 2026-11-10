// Decision Q7.3: a monthly budget for model calls per company, checked in the gate.
import { describe, expect, it } from "vitest";
import { budgetLevel, budgetShare, capOf, capReached, DEFAULT_MONTHLY_CAP_EUR, MAX_MONTHLY_CAP_EUR, monthOf, spendOf } from "@/features/ai/budget";
import { aiGate } from "@/features/ai/gate";
import type { AiSettings } from "@/features/ai/settings";
import { assistGate } from "@/features/assist/gate";

const bedrock: AiSettings = { choice: "bedrock", region: "eu-central-1", model: "m", endpoint: null, deployment: null };
const real = { stage: "pilot", hasDatabase: true, settings: bedrock, dpaSignedAt: new Date("2026-10-01"), purpose: "assist" as const, assistantOn: true, aiRouting: true };
const of50 = (spentEur: number) => ({ capEur: 50, spentEur });

describe("AI budget", () => {
  it("the cap is the stored whole number of euros, or the default of 50", () => {
    expect(DEFAULT_MONTHLY_CAP_EUR).toBe(50);
    expect(capOf(null)).toBe(50);
    expect(capOf(undefined)).toBe(50);
    expect(capOf(-1)).toBe(50);
    expect(capOf(Number.NaN)).toBe(50);
    expect(capOf(0)).toBe(0);
    expect(capOf(120)).toBe(120);
    expect(capOf(120.9)).toBe(120);
    expect(capOf(10 ** 9)).toBe(MAX_MONTHLY_CAP_EUR);
  });

  it("the month runs from its first instant to the next month's, also over the year's end", () => {
    expect(monthOf(new Date("2026-11-10T12:41:00Z"))).toEqual({ from: new Date("2026-11-01T00:00:00Z"), to: new Date("2026-12-01T00:00:00Z") });
    expect(monthOf(new Date("2026-12-31T23:59:59Z"))).toEqual({ from: new Date("2026-12-01T00:00:00Z"), to: new Date("2027-01-01T00:00:00Z") });
    expect(monthOf(new Date("2026-11-01T00:00:00Z")).from).toEqual(new Date("2026-11-01T00:00:00Z"));
  });

  it("spend adds the priced models; a model without a price is named and not guessed", () => {
    const s = spendOf([
      { model: "anthropic.claude-haiku-5-5", tokensIn: 1_000_000, tokensOut: 1_000_000 }, // 0.6
      { model: "eu.anthropic.claude-sonnet-5-5", tokensIn: 1_000_000, tokensOut: 1_000_000 }, // 12
      { model: "mock", tokensIn: 9_000_000, tokensOut: 9_000_000 },
      { model: "mistral-nemo", tokensIn: 5_000_000, tokensOut: 5_000_000 },
      { model: "gpt-4.1-mini", tokensIn: 1, tokensOut: 1 },
    ]);
    expect(s).toEqual({ spentEur: 12.6, unpriced: ["gpt-4.1-mini", "mistral-nemo"] });
    expect(spendOf([])).toEqual({ spentEur: 0, unpriced: [] });
  });

  it("the levels: quiet below 70 %, a warning from 70 and from 90, used up at 100", () => {
    expect([0, 34.99, 35, 44.99, 45, 49.99, 50, 80].map((n) => budgetLevel(of50(n)))).toEqual(["ok", "ok", "warn70", "warn70", "warn90", "warn90", "reached", "reached"]);
    expect([0, 34.99, 35, 49.99, 50, 80].map((n) => budgetShare(of50(n)))).toEqual([0, 69, 70, 99, 100, 160]);
    expect(capReached(of50(49.9999))).toBe(false);
  });

  it("a cap of 0 is used up from the first day", () => {
    expect(budgetLevel({ capEur: 0, spentEur: 0 })).toBe("reached");
    expect(budgetShare({ capEur: 0, spentEur: 0 })).toBe(100);
  });
});

describe("AI gate with the budget", () => {
  it("open below the cap, closed at it, and the reason names the budget", () => {
    expect(aiGate({ ...real, budget: of50(49.99) })).toEqual({ on: true, settings: bedrock });
    expect(aiGate({ ...real, budget: of50(50) })).toEqual({ on: false, why: expect.stringContaining("budget") });
    for (const purpose of ["assist", "routing", "coach", "brain"] as const) {
      expect(aiGate({ ...real, purpose, budget: of50(51) }).on).toBe(false);
    }
  });

  it("a demo company is held to the cap too: a real model costs the same there", () => {
    expect(aiGate({ ...real, stage: "demo", budget: of50(10) }).on).toBe(true);
    expect(aiGate({ ...real, stage: "demo", dpaSignedAt: null, budget: of50(50) })).toEqual({ on: false, why: expect.stringContaining("budget") });
  });

  it("the mock costs nothing and goes on; no database means nothing to count", () => {
    const mock = { ...bedrock, choice: "mock" as const };
    expect(aiGate({ ...real, settings: mock, budget: of50(500) })).toEqual({ on: true, settings: mock });
    expect(aiGate({ ...real, stage: "demo", settings: mock, budget: of50(500) }).on).toBe(true);
    expect(aiGate({ ...real, stage: "demo", hasDatabase: false, budget: null }).on).toBe(true);
  });

  it("an earlier no keeps its own reason", () => {
    expect(aiGate({ ...real, settings: { ...bedrock, choice: "off" }, budget: of50(500) })).toEqual({ on: false, why: expect.stringContaining("switched off") });
    expect(aiGate({ ...real, assistantOn: false, budget: of50(500) })).toEqual({ on: false, why: expect.stringContaining("assistant is switched off") });
    expect(aiGate({ ...real, dpaSignedAt: null, budget: of50(500) })).toEqual({ on: false, why: expect.stringContaining("agreement") });
  });

  it("the assistant's wrapper passes the budget on", () => {
    const base = { stage: "pilot", hasDatabase: true, configured: "bedrock" as const, enabled: true, dpaSignedAt: new Date("2026-10-01") };
    expect(assistGate({ ...base, budget: of50(10) })).toEqual({ on: true, provider: "bedrock" });
    expect(assistGate({ ...base, budget: of50(50) }).on).toBe(false);
    expect(assistGate(base).on).toBe(true);
  });
});
