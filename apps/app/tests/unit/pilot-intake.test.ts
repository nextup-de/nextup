import { describe, expect, it } from "vitest";
import { intakeTokenMatches } from "@/features/pilot/intake";

describe("intakeTokenMatches", () => {
  const token = "3f1c9a7e5b2d4c6a8e0f1b3d5c7a9e1f";

  it("accepts the configured token", () => {
    expect(intakeTokenMatches(`Bearer ${token}`, token)).toBe(true);
  });

  it("rejects a wrong or truncated token", () => {
    expect(intakeTokenMatches("Bearer nope", token)).toBe(false);
    expect(intakeTokenMatches(`Bearer ${token.slice(0, -1)}`, token)).toBe(false);
  });

  it("rejects a missing or malformed header", () => {
    expect(intakeTokenMatches(null, token)).toBe(false);
    expect(intakeTokenMatches(token, token)).toBe(false);
    expect(intakeTokenMatches("Basic abc", token)).toBe(false);
  });

  it("is closed when no token is configured, even for an empty bearer", () => {
    expect(intakeTokenMatches("Bearer x", undefined)).toBe(false);
    expect(intakeTokenMatches("Bearer x", "")).toBe(false);
  });
});
