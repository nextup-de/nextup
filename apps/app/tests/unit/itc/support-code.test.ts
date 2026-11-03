import { describe, expect, it } from "vitest";
import {
  appendSignin,
  grantActive,
  hashSupportCode,
  newSupportCode,
  SUPPORT_CODE_ALPHABET,
  verifySupportCode,
} from "@/features/admin/support-code";

describe("ITC support code", () => {
  it("has 12 characters of the allowed alphabet", () => {
    for (let i = 0; i < 50; i++) {
      const code = newSupportCode();
      expect(code).toHaveLength(12);
      expect([...code].every((ch) => SUPPORT_CODE_ALPHABET.includes(ch))).toBe(true);
    }
    expect(newSupportCode()).not.toBe(newSupportCode());
  });

  it("verifies against its own hash only, and the hash is salted", () => {
    const code = newSupportCode();
    const stored = hashSupportCode(code);
    expect(stored).not.toContain(code);
    expect(verifySupportCode(code, stored)).toBe(true);
    expect(verifySupportCode(newSupportCode(), stored)).toBe(false);
    expect(hashSupportCode(code)).not.toBe(stored);
    expect(verifySupportCode(code, "garbage")).toBe(false);
  });

  it("is active until it expires or is revoked", () => {
    const now = new Date("2026-11-20T10:00:00Z");
    const hours = (h: number) => new Date(now.getTime() + h * 3_600_000);
    expect(grantActive({ expiresAt: hours(24), revokedAt: null }, now)).toBe(true);
    expect(grantActive({ expiresAt: hours(24), revokedAt: now }, now)).toBe(false);
    expect(grantActive({ expiresAt: hours(-1), revokedAt: null }, now)).toBe(false);
    expect(grantActive({ expiresAt: now, revokedAt: null }, now)).toBe(false);
  });

  it("keeps the last 20 sign-in times", () => {
    let list: string[] = [];
    for (let i = 0; i < 25; i++) list = appendSignin(list, new Date(Date.UTC(2026, 10, 1, 0, i)));
    expect(list).toHaveLength(20);
    expect(list[19]).toBe(new Date(Date.UTC(2026, 10, 1, 0, 24)).toISOString());
    expect(appendSignin("nope", new Date(0))).toHaveLength(1);
  });
});
