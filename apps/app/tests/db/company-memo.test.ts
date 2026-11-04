// TST-FL1-1: the per-process memory of company reads (src/lib/db/company-memo.ts) is seen through by this process's own writes.
import { afterAll, afterEach, beforeAll, describe, expect, it, vi } from "vitest";
import { NO_KNOWLEDGE, type Knowledge } from "@/features/knowledge";
import { getDb } from "@/lib/db/client";
import { forgetMemo } from "@/lib/db/company-memo";
import { loadSeats } from "@/lib/db/holders";
import { loadKnowledge, replaceKnowledge } from "@/lib/db/knowledge";

const db = getDb();
const id = () => crypto.randomUUID();
let companyId = "";

const knowledge = (holder: string): Knowledge => {
  const unit = id();
  const role = id();
  return {
    ...NO_KNOWLEDGE,
    units: [{ id: unit, key: "U", name: "Unit", kind: "dept", headcount: 1, parentId: null, sort: 0 }],
    roles: [{ id: role, orgUnitId: unit, title: "Lead", reportsToId: null, decides: [], spendLimitEur: null, skills: [], sort: 0 }],
    holders: [{ id: id(), roleId: role, name: holder, userId: null, sort: 0 }],
  };
};

beforeAll(async () => {
  companyId = (await db.company.create({ data: { slug: "memo-" + id().slice(0, 8), name: "Memo", seedJson: {} } })).id;
  await replaceKnowledge(companyId, knowledge("First"));
});

afterEach(() => {
  vi.unstubAllEnvs();
  forgetMemo();
});

afterAll(async () => {
  await db.company.deleteMany({ where: { id: companyId } });
});

describe("company memo through the client", () => {
  it("keeps seats between reads while on, and a write through this client shows at once", async () => {
    vi.stubEnv("COMPANY_CACHE_MS", "600000");
    expect((await loadSeats(companyId)).map((s) => s.label)).toEqual(["First"]);
    // A write this client cannot see (raw SQL, as another process would make it): the old value is kept.
    await db.$executeRaw`UPDATE "OrgRoleHolder" SET "name" = 'Raw' WHERE "companyId" = ${companyId}`;
    expect((await loadSeats(companyId)).map((s) => s.label)).toEqual(["First"]);
    // A write through the client forgets, so the next read is the table.
    await replaceKnowledge(companyId, knowledge("Second"));
    expect((await loadSeats(companyId)).map((s) => s.label)).toEqual(["Second"]);
    expect((await loadKnowledge(companyId)).holders.map((h) => h.name)).toEqual(["Second"]);
  });

  it("reads the table every time while off", async () => {
    expect((await loadSeats(companyId)).map((s) => s.label)).toEqual(["Second"]);
    await db.$executeRaw`UPDATE "OrgRoleHolder" SET "name" = 'Third' WHERE "companyId" = ${companyId}`;
    expect((await loadSeats(companyId)).map((s) => s.label)).toEqual(["Third"]);
  });
});
