// The ErrorGroup table (lib/db/errors.ts): a round's counts add up per fingerprint, a known kind
// waits to be sent again, and old kinds are pruned.
import { afterAll, beforeEach, describe, expect, it } from "vitest";
import { drain, record, toErrorEvent, type ErrorStore } from "@/features/errors";
import { getDb } from "@/lib/db/client";
import { pruneErrorGroups, saveErrorGroups } from "@/lib/db/errors";

const db = getDb();
const DAY = 86_400_000;

function round(at: number, ...messages: string[]) {
  const store: ErrorStore = new Map();
  for (const m of messages) record(store, toErrorEvent("server", new Error(m), "/[company]/raise", at));
  return drain(store);
}

beforeEach(async () => {
  await db.errorGroup.deleteMany({});
});

afterAll(async () => {
  await db.errorGroup.deleteMany({});
  await db.$disconnect();
});

describe("saveErrorGroups", () => {
  it("adds counts per fingerprint and marks a known kind pending again", async () => {
    const t0 = Date.now() - 60_000;
    await saveErrorGroups(round(t0, "boom", "boom", "other"), "abc1234");
    const fp = round(t0, "boom")[0].fingerprint;
    await db.errorGroup.update({ where: { fingerprint: fp }, data: { pending: false } });

    await saveErrorGroups(round(t0 + 30_000, "boom"), "def5678");
    const row = await db.errorGroup.findUniqueOrThrow({ where: { fingerprint: fp } });
    expect(row).toMatchObject({ count: 3, pending: true, appCommit: "def5678", route: "/[company]/raise" });
    expect(row.firstSeenAt.getTime()).toBe(t0);
    expect(row.lastSeenAt.getTime()).toBe(t0 + 30_000);
    expect(await db.errorGroup.count()).toBe(2);
  });
});

describe("pruneErrorGroups", () => {
  it("forgets kinds not seen for 30 days", async () => {
    const now = Date.now();
    await saveErrorGroups(round(now - 31 * DAY, "old"), null);
    await saveErrorGroups(round(now - DAY, "recent"), null);
    await pruneErrorGroups(now);
    expect((await db.errorGroup.findMany()).map((r) => r.message)).toEqual(["recent"]);
  });
});
