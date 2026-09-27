// Personal login codes (src/features/auth/login-code.ts). The point of these: a code maps to one
// hash regardless of how it is typed, codes do not repeat, and the shape check is per company.
import { describe, expect, it } from "vitest";
import { generateLoginCode, hashLoginCode, looksLikeLoginCode, looksLikeSharedCode, normalizeLoginCode } from "@/features/auth/login-code";

describe("personal login code", () => {
  it("carries the slug and three readable groups", () => {
    expect(generateLoginCode("acme")).toMatch(/^acme-[23456789a-hjkmnp-z]{4}-[23456789a-hjkmnp-z]{4}-[23456789a-hjkmnp-z]{4}$/);
    expect(generateLoginCode("big-co")).toMatch(/^big-co(-[a-z2-9]{4}){3}$/);
  });

  it("does not repeat", () => {
    const seen = new Set(Array.from({ length: 500 }, () => generateLoginCode("acme")));
    expect(seen.size).toBe(500);
  });

  it("hashes the same however it is typed", () => {
    const code = generateLoginCode("acme");
    const h = hashLoginCode(code);
    expect(h).toMatch(/^[0-9a-f]{64}$/);
    expect(hashLoginCode(`  ${code.toUpperCase()}\n`)).toBe(h);
    expect(hashLoginCode(code.replace(/-/g, " - "))).toBe(h);
    expect(normalizeLoginCode(" ACME-ab cd ")).toBe("acme-abcd");
  });

  it("different codes hash differently", () => {
    expect(hashLoginCode("acme-aaaa-aaaa-aaaa")).not.toBe(hashLoginCode("acme-aaaa-aaaa-aaab"));
  });

  it("shape check is tied to the company", () => {
    const code = generateLoginCode("acme");
    expect(looksLikeLoginCode(code, "acme")).toBe(true);
    expect(looksLikeLoginCode(code.toUpperCase(), "acme")).toBe(true);
    expect(looksLikeLoginCode(code, "globex")).toBe(false);
    expect(looksLikeLoginCode("acme-7f3k-92xd", "acme")).toBe(false); // an old company code
    expect(looksLikeLoginCode("acme-0000-0000-0000", "acme")).toBe(false); // 0 is not in the alphabet
    expect(looksLikeLoginCode("a.me-aaaa-aaaa-aaaa", "a.me")).toBe(true);
    expect(looksLikeLoginCode("axme-aaaa-aaaa-aaaa", "a.me")).toBe(false); // slug is escaped
  });
});

describe("old shared company code", () => {
  it("is recognised so the login can explain, and never mistaken for a personal code", () => {
    expect(looksLikeSharedCode("acme-7f3a-92cd", "acme")).toBe(true);
    expect(looksLikeSharedCode(" ACME-7F3A-92CD ", "acme")).toBe(true);
    expect(looksLikeSharedCode("acme-7f3a-92cd", "globex")).toBe(false);
    expect(looksLikeSharedCode(generateLoginCode("acme"), "acme")).toBe(false);
  });
});
