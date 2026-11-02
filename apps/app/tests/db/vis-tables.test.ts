// The VIS tables against a real Postgres: access-key overlap per company, and the shared rate counter.
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { getDb } from "@/lib/db/client";

const db = getDb();
let a: { id: string };
let b: { id: string };

const view = (companyId: string, caseId: string, accessKeys: string[]) => ({
  companyId,
  caseId,
  kind: "problem",
  status: "open",
  open: true,
  dueDay: 5,
  lastDay: 1,
  lastSeq: 1,
  accessKeys,
});

beforeAll(async () => {
  await db.company.deleteMany({});
  await db.rateCounter.deleteMany({});
  a = await db.company.create({ data: { slug: "vis-a", name: "A", seedJson: {} } });
  b = await db.company.create({ data: { slug: "vis-b", name: "B", seedJson: {} } });
  await db.caseView.create({ data: view(a.id, "c1", ["u:1", "r:x"]) });
  await db.caseView.create({ data: view(b.id, "c1", ["r:x", "all"]) });
});

afterAll(async () => {
  await db.company.deleteMany({});
  await db.rateCounter.deleteMany({});
  await db.$disconnect();
});

describe("VIS tables", () => {
  it("finds a case by an overlap of access keys, scoped to its company", async () => {
    const rows = await db.$queryRaw<{ companyId: string; caseId: string }[]>`
      SELECT "companyId", "caseId" FROM "CaseView" WHERE "companyId" = ${a.id} AND "accessKeys" && ${["r:x"]}::text[]`;
    expect(rows).toEqual([{ companyId: a.id, caseId: "c1" }]);
    const none = await db.$queryRaw<unknown[]>`
      SELECT 1 FROM "CaseView" WHERE "companyId" = ${a.id} AND "accessKeys" && ${["all"]}::text[]`;
    expect(none).toHaveLength(0);
  });
  it("upserts a rate counter and increments count", async () => {
    const resetAt = new Date(Date.now() + 60_000);
    const hit = () =>
      db.rateCounter.upsert({
        where: { key: "k" },
        create: { key: "k", count: 1, resetAt },
        update: { count: { increment: 1 } },
      });
    expect((await hit()).count).toBe(1);
    expect((await hit()).count).toBe(2);
  });
});
