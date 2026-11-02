// VIS-D1: rate limits counted in Postgres, so every instance counts against one limit.
import { afterAll, beforeEach, describe, expect, it } from "vitest";
import { getDb } from "@/lib/db/client";
import { clearShared, hitShared, sweepShared } from "@/lib/db/rate-limit";

const db = getDb();
const rule = { limit: 2, windowMs: 60_000 };
const T0 = 1_800_000_000_000;

beforeEach(async () => {
  await db.rateCounter.deleteMany({});
});

afterAll(async () => {
  await db.rateCounter.deleteMany({});
  await db.$disconnect();
});

// Two "instances" are two callers that share nothing but the database.
const instanceA = (key: string, now: number) => hitShared(key, rule, now);
const instanceB = (key: string, now: number) => hitShared(key, rule, now);

describe("VIS shared rate limits", () => {
  it("counts two instances against one limit and refuses the third hit", async () => {
    expect(await instanceA("k", T0)).toEqual({ ok: true, remaining: 1 });
    expect(await instanceB("k", T0 + 1000)).toEqual({ ok: true, remaining: 0 });
    expect(await instanceA("k", T0 + 2000)).toEqual({ ok: false, retryAfterSeconds: 58 });
    expect(await instanceB("k", T0 + 3000)).toEqual({ ok: false, retryAfterSeconds: 57 });
  });

  it("lets only the limit through when hits arrive at the same moment", async () => {
    const verdicts = await Promise.all(Array.from({ length: 8 }, (_, i) => (i % 2 ? instanceA : instanceB)("race", T0)));
    expect(verdicts.filter((v) => v.ok)).toHaveLength(2);
  });

  it("keeps keys apart", async () => {
    await instanceA("one", T0);
    await instanceA("one", T0);
    expect((await instanceB("two", T0)).ok).toBe(true);
  });

  it("starts a new window once resetAt has passed", async () => {
    await instanceA("k", T0);
    await instanceA("k", T0);
    expect((await instanceA("k", T0 + 59_000)).ok).toBe(false);
    expect(await instanceB("k", T0 + rule.windowMs)).toEqual({ ok: true, remaining: 1 });
  });

  it("clearShared resets a key", async () => {
    await instanceA("k", T0);
    await instanceA("k", T0);
    expect((await instanceA("k", T0)).ok).toBe(false);
    await clearShared("k");
    expect(await instanceB("k", T0)).toEqual({ ok: true, remaining: 1 });
  });

  it("sweepShared deletes expired windows only", async () => {
    await instanceA("old", T0);
    await instanceA("new", T0 + 50_000);
    expect(await sweepShared(T0 + rule.windowMs)).toBe(1);
    expect((await db.rateCounter.findMany()).map((r) => r.key)).toEqual(["new"]);
  });
});
