import { describe, expect, it } from "vitest";
import { aiCost } from "@/features/ai/usage";

describe("AID cost", () => {
  it("prices a million in and out by the list table", () => {
    expect(aiCost("anthropic.claude-haiku-5-5", 1_000_000, 1_000_000)).toBe(0.6);
    expect(aiCost("eu.anthropic.claude-sonnet-5-5", 1_000_000, 1_000_000)).toBe(12);
    expect(aiCost("claude-opus-5-5", 1_000_000, 1_000_000)).toBe(24);
  });
  it("costs nothing for the mock and the empty model, null for an unknown one", () => {
    expect(aiCost("mock", 5000, 500)).toBe(0);
    expect(aiCost("", 5000, 500)).toBe(0);
    expect(aiCost("mistral-nemo", 5000, 500)).toBeNull();
  });
  it("rounds to four decimals", () => {
    expect(aiCost("anthropic.claude-sonnet-5-5", 8000, 600)).toBe(0.022);
  });
});
