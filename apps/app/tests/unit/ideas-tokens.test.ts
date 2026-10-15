import { describe, expect, it } from "vitest";
import { hasToken, parseParts, PROMPTS, serializeParts, toneOf } from "@/components/ideas/raiseTokens";

describe("raise prompt tokens", () => {
  it("splits *Label* runs from text and writes them back unchanged", () => {
    const v = "Line one\n*Impact* fewer lost reports *Deadline* Friday";
    const parts = parseParts(v);
    expect(parts.filter((p) => "token" in p)).toEqual([{ token: "Impact" }, { token: "Deadline" }]);
    expect(serializeParts(parts)).toBe(v);
  });
  it("knows a prompt's colour and falls back to grey for typed text", () => {
    expect(toneOf("Who’s involved")).toBe("blue");
    expect(toneOf("impact")).toBe("orange");
    expect(toneOf("anything else")).toBe("grey");
  });
  it("finds a token regardless of case and ignores stray asterisks", () => {
    expect(hasToken("x *Impact* y", "impact")).toBe(true);
    expect(hasToken("2 * 3 * 4", "3")).toBe(false);
    expect(PROMPTS.length).toBeGreaterThan(4);
  });
});
