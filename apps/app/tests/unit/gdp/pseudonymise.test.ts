import { describe, expect, it } from "vitest";
import { confirmMatches, pickPseudonymNumber, pseudonymLabel } from "@/features/privacy/pseudonymise";

describe("GDP pseudonymise rules", () => {
  it("picks a number in 1000-9999 that is free and unique, also with 9000 taken", () => {
    const taken = new Set<number>();
    for (let n = 1000; n < 10_000; n++) if (n % 10 !== 0 || n < 9000) taken.add(n);
    for (let i = 0; i < 50; i++) {
      const n = pickPseudonymNumber(taken, () => 0.37);
      expect(taken.has(n)).toBe(false);
      expect(n).toBeGreaterThanOrEqual(1000);
      taken.add(n);
    }
    expect(pickPseudonymNumber([9000], () => 0.9998)).not.toBe(9000);
  });

  it("goes to 5 digits when 4 digits are all taken", () => {
    const all = Array.from({ length: 9000 }, (_, i) => 1000 + i);
    const n = pickPseudonymNumber(all, () => 0.5);
    expect(n).toBeGreaterThanOrEqual(10_000);
    expect(n).toBeLessThan(100_000);
  });

  it("labels follow the locale", () => {
    expect(pseudonymLabel(4471, "en")).toBe("Former member #4471");
    expect(pseudonymLabel(4471, "de")).toBe("Ehemaliges Mitglied #4471");
  });

  it("the confirmation ignores case and spaces", () => {
    expect(confirmMatches(" l.  brandt ", "L. Brandt")).toBe(true);
    expect(confirmMatches("L. Brand", "L. Brandt")).toBe(false);
    expect(confirmMatches("", "")).toBe(false);
  });
});
