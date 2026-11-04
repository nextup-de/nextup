import { afterEach, describe, expect, it, vi } from "vitest";
import { forgetMemo, memo, memoMs } from "./company-memo";

afterEach(() => {
  vi.unstubAllEnvs();
  vi.useRealTimers();
  forgetMemo();
});

describe("company memo", () => {
  it("is off without COMPANY_CACHE_MS, so a read after a write sees the write", async () => {
    let n = 0;
    expect(await memo("k", "a", async () => ++n)).toBe(1);
    expect(await memo("k", "a", async () => ++n)).toBe(2);
  });

  it("reads COMPANY_CACHE_MS as whole milliseconds only", () => {
    expect(memoMs({})).toBe(0);
    expect(memoMs({ COMPANY_CACHE_MS: "3000" })).toBe(3000);
    expect(memoMs({ COMPANY_CACHE_MS: "-1" })).toBe(0);
    expect(memoMs({ COMPANY_CACHE_MS: "2.5" })).toBe(0);
    expect(memoMs({ COMPANY_CACHE_MS: "soon" })).toBe(0);
  });

  it("keeps a read for the TTL, shares a concurrent load, then reads again", async () => {
    vi.stubEnv("COMPANY_CACHE_MS", "1000");
    vi.useFakeTimers();
    let n = 0;
    const load = async () => ++n;
    const [a, b] = await Promise.all([memo("k", "a", load), memo("k", "a", load)]);
    expect([a, b, n]).toEqual([1, 1, 1]);
    vi.advanceTimersByTime(999);
    expect(await memo("k", "a", load)).toBe(1);
    vi.advanceTimersByTime(2);
    expect(await memo("k", "a", load)).toBe(2);
  });

  it("keeps kinds and keys apart, and forgets all after a write", async () => {
    vi.stubEnv("COMPANY_CACHE_MS", "1000");
    let n = 0;
    const load = async () => ++n;
    expect(await memo("seats", "c1", load)).toBe(1);
    expect(await memo("seats", "c2", load)).toBe(2);
    expect(await memo("people", "c1", load)).toBe(3);
    expect(await memo("seats", "c1", load)).toBe(1);
    forgetMemo();
    expect(await memo("seats", "c1", load)).toBe(4);
  });

  it("does not keep a failed read", async () => {
    vi.stubEnv("COMPANY_CACHE_MS", "1000");
    await expect(memo("k", "a", async () => { throw new Error("down"); })).rejects.toThrow("down");
    expect(await memo("k", "a", async () => "up")).toBe("up");
  });
});
