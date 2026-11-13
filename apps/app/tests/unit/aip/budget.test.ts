// Decision Q7.3: a monthly budget for model calls per company, checked in the gate.
import { describe, expect, it } from "vitest";
import { budgetLevel, budgetShare, capOf, capReached, DEFAULT_MONTHLY_CAP_EUR, MAX_MONTHLY_CAP_EUR, monthOf, spendOf } from "@/features/ai/budget";
import { aiGate } from "@/features/ai/gate";
import type { AiSettings } from "@/features/ai/settings";

const bedrock: AiSettings = { choice: "bedrock", region: "eu-central-1", model: "m", endpoint: null, deployment: null, brainModel: "bm" };
const real = { stage: "pilot", hasDatabase: true, settings: bedrock, dpaSignedAt: new Date("2026-10-01"), purpose: "assist" as const, assistantOn: true, aiRouting: true };
const NO_TOKENS = { tokensUnpriced: 0, tokenCap: 20_000_000 };
const of50 = (spentEur: number) => ({ capEur: 50, spentEur, ...NO_TOKENS });

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
      { model: "gpt-4o-mini", tokensIn: 1, tokensOut: 1 },
    ]);
    expect(s).toEqual({ spentEur: 12.6, unpriced: ["gpt-4o-mini", "mistral-nemo"], tokensUnpriced: 10_000_002 });
    expect(spendOf([])).toEqual({ spentEur: 0, unpriced: [], tokensUnpriced: 0 });
  });

  it("the levels: quiet below 70 %, a warning from 70 and from 90, used up at 100, stopped at 120", () => {
    expect([0, 34.99, 35, 44.99, 45, 49.99, 50, 59.99, 60, 80].map((n) => budgetLevel(of50(n)))).toEqual(["ok", "ok", "warn70", "warn70", "warn90", "warn90", "reached", "reached", "stopped", "stopped"]);
    expect([0, 34.99, 35, 49.99, 50, 80].map((n) => budgetShare(of50(n)))).toEqual([0, 69, 70, 99, 100, 160]);
    // Whole percents without the float error of dividing first (57 / 100 * 100 = 56.99...).
    expect([29, 57, 58].map((n) => budgetShare({ capEur: 100, spentEur: n }))).toEqual([29, 57, 58]);
    expect(capReached(of50(49.9999))).toBe(false);
  });

  it("a cap of 0 is used up from the first day, with no grace", () => {
    expect(budgetLevel({ capEur: 0, spentEur: 0 })).toBe("stopped");
    expect(budgetShare({ capEur: 0, spentEur: 0 })).toBe(100);
  });
});

describe("AI gate with the budget", () => {
  it("open below the cap, closed at it, and the reason names the budget; the raise path goes on to 120 %", () => {
    expect(aiGate({ ...real, purpose: "brain", budget: of50(49.99) })).toEqual({ on: true, settings: bedrock });
    expect(aiGate({ ...real, purpose: "brain", budget: of50(50) })).toEqual({ on: false, why: expect.stringContaining("budget") });
    expect(aiGate({ ...real, purpose: "brain", budget: of50(51) }).on).toBe(false);
    for (const purpose of ["assist", "routing", "coach"] as const) {
      expect(aiGate({ ...real, purpose, budget: of50(51) }).on).toBe(true);
      expect(aiGate({ ...real, purpose, budget: of50(60) })).toEqual({ on: false, why: expect.stringContaining("budget") });
    }
  });

  it("a demo company is held to the cap too: a real model costs the same there", () => {
    expect(aiGate({ ...real, stage: "demo", budget: of50(10) }).on).toBe(true);
    expect(aiGate({ ...real, stage: "demo", dpaSignedAt: null, purpose: "brain", budget: of50(50) })).toEqual({ on: false, why: expect.stringContaining("budget") });
    expect(aiGate({ ...real, stage: "demo", dpaSignedAt: null, budget: of50(60) })).toEqual({ on: false, why: expect.stringContaining("budget") });
  });

  it("the mock assistant costs nothing and goes on; no database means nothing to count", () => {
    const mock = { ...bedrock, choice: "mock" as const };
    expect(aiGate({ ...real, settings: mock, budget: of50(500) })).toEqual({ on: true, settings: mock });
    expect(aiGate({ ...real, stage: "demo", settings: mock, budget: of50(500) }).on).toBe(true);
    expect(aiGate({ ...real, stage: "demo", settings: mock, budget: { capEur: 0, spentEur: 0, ...NO_TOKENS } }).on).toBe(true);
    expect(aiGate({ ...real, stage: "demo", hasDatabase: false, budget: null }).on).toBe(true);
  });

  it("a demo company saved as off is capped like the mock: the brain still answers with its own model", () => {
    const off = { ...bedrock, choice: "off" as const };
    for (const purpose of ["routing", "coach", "brain"] as const) {
      expect(aiGate({ ...real, stage: "demo", settings: off, purpose, budget: { capEur: 0, spentEur: 0, ...NO_TOKENS } }).on).toBe(false);
      expect(aiGate({ ...real, stage: "demo", settings: off, purpose, budget: of50(10) }).on).toBe(true);
    }
    // The assistant answers with the mock, which costs nothing; a real stage says it is switched off.
    expect(aiGate({ ...real, stage: "demo", settings: off, budget: { capEur: 0, spentEur: 0, ...NO_TOKENS } }).on).toBe(true);
    expect(aiGate({ ...real, settings: off, purpose: "routing", budget: of50(60) })).toEqual({ on: false, why: expect.stringContaining("switched off") });
  });

  it("with the mock chosen the brain still calls its own model: routing, coach and brain are capped", () => {
    const mock = { ...bedrock, choice: "mock" as const };
    for (const purpose of ["routing", "coach", "brain"] as const) {
      expect(aiGate({ ...real, stage: "demo", settings: mock, purpose, budget: of50(10) }).on).toBe(true);
      expect(aiGate({ ...real, stage: "demo", settings: mock, purpose, budget: of50(60) })).toEqual({ on: false, why: expect.stringContaining("budget") });
      // A cap of 0 stops them from the first day, as the form says.
      expect(aiGate({ ...real, stage: "demo", settings: mock, purpose, budget: { capEur: 0, spentEur: 0, ...NO_TOKENS } }).on).toBe(false);
    }
  });

  it("an earlier no keeps its own reason", () => {
    expect(aiGate({ ...real, settings: { ...bedrock, choice: "off" }, budget: of50(500) })).toEqual({ on: false, why: expect.stringContaining("switched off") });
    expect(aiGate({ ...real, assistantOn: false, budget: of50(500) })).toEqual({ on: false, why: expect.stringContaining("assistant is switched off") });
    expect(aiGate({ ...real, dpaSignedAt: null, budget: of50(500) })).toEqual({ on: false, why: expect.stringContaining("agreement") });
  });

  it("the assistant's purpose passes the budget on", () => {
    const ask = (budget?: ReturnType<typeof of50>) => aiGate({ stage: "pilot", hasDatabase: true, settings: { ...bedrock }, dpaSignedAt: new Date("2026-10-01"), purpose: "assist", assistantOn: true, aiRouting: true, budget: budget ?? null });
    expect(ask(of50(10)).on).toBe(true);
    expect(ask(of50(50)).on).toBe(true);
    expect(ask(of50(60)).on).toBe(false);
    expect(ask().on).toBe(true);
  });
});
