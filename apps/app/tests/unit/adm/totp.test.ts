import { describe, expect, it } from "vitest";
import { base32Decode, base32Encode, otpauthUrl, totpAt, verifyTotp } from "@/features/auth/totp";

// RFC 6238 appendix B: the SHA-1 key is the ASCII string "12345678901234567890".
const KEY = base32Encode(Buffer.from("12345678901234567890", "ascii"));

describe("ADM TOTP", () => {
  it("gives the RFC 6238 SHA-1 vectors as 8 digits", () => {
    const vectors: [number, string][] = [
      [59, "94287082"],
      [1111111109, "07081804"],
      [1111111111, "14050471"],
      [1234567890, "89005924"],
      [2000000000, "69279037"],
      [20000000000, "65353130"],
    ];
    for (const [seconds, want] of vectors) expect(totpAt(KEY, seconds * 1000, 8)).toBe(want);
  });

  it("truncates to 6 digits by the same rule", () => {
    expect(totpAt(KEY, 59_000)).toBe("287082");
    expect(totpAt(KEY, 1111111109_000)).toBe("081804");
  });

  it("accepts one step of drift and refuses two", () => {
    const now = 1_000_000_000_000;
    const code = totpAt(KEY, now);
    expect(verifyTotp(KEY, code, now)).toBe(true);
    expect(verifyTotp(KEY, code, now + 30_000)).toBe(true);
    expect(verifyTotp(KEY, code, now - 30_000)).toBe(true);
    expect(verifyTotp(KEY, code, now + 60_000)).toBe(false);
    expect(verifyTotp(KEY, code, now - 60_000)).toBe(false);
    expect(verifyTotp(KEY, "12345", now)).toBe(false);
    expect(verifyTotp(KEY, "abcdef", now)).toBe(false);
  });

  it("round-trips base32 and ignores spaces, case and padding", () => {
    for (const len of [0, 1, 2, 3, 4, 5, 10, 20]) {
      const bytes = Buffer.from(Array.from({ length: len }, (_, i) => (i * 37 + 11) % 256));
      expect(base32Decode(base32Encode(bytes))?.equals(bytes)).toBe(true);
    }
    expect(base32Encode(Buffer.from("foobar"))).toBe("MZXW6YTBOI");
    expect(base32Decode("mzxw 6ytb-oi======")?.toString()).toBe("foobar");
    expect(base32Decode("not base32!")).toBeNull();
  });

  it("builds the otpauth link", () => {
    const url = otpauthUrl("NextUp", "a@b.example", KEY);
    expect(url.startsWith("otpauth://totp/NextUp:a%40b.example?")).toBe(true);
    expect(url).toContain(`secret=${KEY}`);
    expect(url).toContain("digits=6");
    expect(url).toContain("period=30");
  });
});
