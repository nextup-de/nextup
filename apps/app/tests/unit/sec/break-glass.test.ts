import { createHash } from "node:crypto";
import { describe, expect, it } from "vitest";
import { codeMatches, parseWindow, windowOpen } from "@/features/admin/break-glass";

const sha = (c: string) => createHash("sha256").update(c).digest("hex");
const json = (over: Record<string, unknown> = {}) =>
  JSON.stringify({ v: 1, codeSha256: sha("abc123"), openedAt: "2026-11-04T10:00:00Z", until: "2026-11-04T12:00:00Z", by: "op", reason: "fix", ...over });

describe("SEC break-glass window", () => {
  it("parses the script's JSON", () => {
    const w = parseWindow(json());
    expect(w?.until.toISOString()).toBe("2026-11-04T12:00:00.000Z");
    expect(w?.openedAt.toISOString()).toBe("2026-11-04T10:00:00.000Z");
    expect(w?.by).toBe("op");
  });

  it("counts a broken file as closed", () => {
    for (const bad of ["", "{", "null", "[]", json({ v: 2 }), json({ codeSha256: "zz" }), json({ until: "soon" }), json({ openedAt: 5 })]) {
      expect(parseWindow(bad)).toBeNull();
    }
    expect(windowOpen(null, new Date())).toBe(false);
  });

  it("is open only before until", () => {
    const w = parseWindow(json());
    expect(windowOpen(w, new Date("2026-11-04T11:59:59Z"))).toBe(true);
    expect(windowOpen(w, new Date("2026-11-04T12:00:00Z"))).toBe(false);
    expect(windowOpen(w, new Date("2026-11-05T00:00:00Z"))).toBe(false);
  });

  it("matches a code only against its hash", () => {
    const w = parseWindow(json())!;
    expect(codeMatches("abc123", w)).toBe(true);
    expect(codeMatches(" abc123\n", w)).toBe(true);
    expect(codeMatches("abc124", w)).toBe(false);
    expect(codeMatches("", w)).toBe(false);
  });
});
