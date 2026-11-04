import { describe, expect, it } from "vitest";
import {
  SUPPORT_GRANT_CHOICES,
  SUPPORT_GRANT_HOURS,
  SUPPORT_GRANT_MAX_HOURS,
  checkReason,
  extendTo,
  isGrantChoice,
  supportPageState,
} from "@/features/admin/support-code";

const NOW = new Date("2026-11-16T10:00:00Z");
const h = (n: number, from = NOW) => new Date(from.getTime() + n * 3_600_000);

describe("SEC support grant", () => {
  it("the form takes 1, 4, 24 or 72 hours", () => {
    expect([...SUPPORT_GRANT_CHOICES]).toEqual([1, 4, 24, 72]);
    expect(SUPPORT_GRANT_MAX_HOURS).toBe(72);
    expect(SUPPORT_GRANT_HOURS).toBe(24);
    for (const n of [1, 4, 24, 72]) expect(isGrantChoice(n)).toBe(true);
    for (const n of [0, 2, 8, 73, "4", null]) expect(isGrantChoice(n)).toBe(false);
  });

  it("the reason is 1-200 characters", () => {
    expect(checkReason("Ticket 1042")).toEqual({ ok: true, value: "Ticket 1042" });
    expect(checkReason("  x  ")).toEqual({ ok: true, value: "x" });
    expect(checkReason("a".repeat(200)).ok).toBe(true);
    expect(checkReason("a".repeat(201)).ok).toBe(false);
    expect(checkReason("   ").ok).toBe(false);
    expect(checkReason(undefined).ok).toBe(false);
  });

  it("extend moves the end from max(now, end) and never past 72 hours from now", () => {
    expect(extendTo(h(2), 4, NOW)).toEqual(h(6));
    expect(extendTo(h(-3), 4, NOW)).toEqual(h(4));
    expect(extendTo(h(60), 24, NOW)).toEqual(h(72));
    expect(extendTo(h(72), 1, NOW)).toEqual(h(72));
  });

  it("the page state follows from the grant and the window", () => {
    const open = { expiresAt: h(2), revokedAt: null };
    expect(supportPageState({ stage: "demo", grant: open, breakGlassUntil: h(1) }, NOW)).toEqual({ kind: "demo" });
    expect(supportPageState({ stage: "pilot", grant: null, breakGlassUntil: null }, NOW)).toEqual({ kind: "none", breakGlassUntil: null });
    expect(supportPageState({ stage: "pilot", grant: { expiresAt: h(2), revokedAt: NOW }, breakGlassUntil: null }, NOW).kind).toBe("none");
    expect(supportPageState({ stage: "pilot", grant: { expiresAt: h(-1), revokedAt: null }, breakGlassUntil: h(-1) }, NOW)).toEqual({ kind: "none", breakGlassUntil: null });
    expect(supportPageState({ stage: "pilot", grant: open, breakGlassUntil: h(1) }, NOW)).toEqual({ kind: "open", until: h(2), canExtend: true, breakGlassUntil: h(1) });
    expect(supportPageState({ stage: "live", grant: { expiresAt: h(72), revokedAt: null }, breakGlassUntil: null }, NOW)).toMatchObject({ kind: "open", canExtend: false });
  });
});
