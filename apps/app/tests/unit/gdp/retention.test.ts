// GDP-R1: the pure retention rules (D16).
import { describe, expect, it } from "vitest";
import { AUDIT_KEEP_DAYS, checkRule, cutoff, daysToMonths, effectiveRules, monthsToDays, retentionDue } from "@/features/privacy/retention";

describe("GDP retention rules", () => {
  it("checks the limits of each kind", () => {
    expect(checkRule("assist_turns", 7).ok).toBe(true);
    expect(checkRule("assist_turns", 730).ok).toBe(true);
    expect(checkRule("assist_turns", 6)).toEqual({ ok: false, key: "retentionTooShort" });
    expect(checkRule("assist_turns", 731)).toEqual({ ok: false, key: "retentionTooLong" });
    expect(checkRule("assist_turns", null).ok).toBe(false);
    expect(checkRule("idea_drafts", 29).ok).toBe(false);
    expect(checkRule("idea_drafts", 30).ok).toBe(true);
    expect(checkRule("idea_drafts", null).ok).toBe(false);
    expect(checkRule("closed_cases", 359).ok).toBe(false);
    expect(checkRule("closed_cases", 360).ok).toBe(true);
    expect(checkRule("closed_cases", 3600).ok).toBe(true);
    expect(checkRule("closed_cases", 3601).ok).toBe(false);
    expect(checkRule("closed_cases", null).ok).toBe(true);
    expect(checkRule("closed_cases", 400.5).ok).toBe(false);
  });

  it("gives the default when no rule row exists", () => {
    expect(effectiveRules([], null)).toEqual({ assist_turns: 90, idea_drafts: 180, closed_cases: null });
    expect(effectiveRules([], { retentionDays: 45 }).assist_turns).toBe(45);
    expect(effectiveRules([{ kind: "assist_turns", keepDays: 30 }], { retentionDays: 45 }).assist_turns).toBe(30);
    expect(effectiveRules([{ kind: "closed_cases", keepDays: 720 }], null).closed_cases).toBe(720);
    expect(AUDIT_KEEP_DAYS).toBe(730);
  });

  it("computes the cutoff from keepDays", () => {
    const now = new Date("2026-11-03T12:00:00Z");
    expect(cutoff(30, now).toISOString()).toBe("2026-10-04T12:00:00.000Z");
  });

  it("is due once a day after 03:00", () => {
    const at = (d: string, h: number, m: number) => new Date(`${d}T${String(h).padStart(2, "0")}:${String(m).padStart(2, "0")}:00`);
    const yesterday = at("2026-11-02", 3, 5);
    expect(retentionDue(yesterday, at("2026-11-03", 2, 59))).toBe(false);
    expect(retentionDue(yesterday, at("2026-11-03", 3, 1))).toBe(true);
    expect(retentionDue(at("2026-11-03", 3, 5), at("2026-11-03", 15, 0))).toBe(false);
    expect(retentionDue(null, at("2026-11-03", 4, 0))).toBe(true);
  });

  it("converts months and days", () => {
    expect(monthsToDays(12)).toBe(360);
    expect(daysToMonths(360)).toBe(12);
  });
});
