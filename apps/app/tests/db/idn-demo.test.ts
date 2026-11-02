import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { templateWrites } from "@/features/demo/content";
import { parseSeed, toSeedJson } from "@/features/demo/parse";
import { getDb } from "@/lib/db/client";
import { bindDemoCompany } from "@/lib/db/demo-identity";
import { writeStructure } from "@/lib/db/structure-writes";

const db = getDb();
let companyId = "";

beforeAll(async () => {
  await db.company.deleteMany({ where: { slug: "idn-demo" } });
  const writes = templateWrites("demo", () => crypto.randomUUID());
  const person = (name: string, role: string, handle?: string) => ({
    name, email: name.replace(/\W+/g, "").toLowerCase() + "@idn-demo.example", role, dept: "", ini: "XX", handle: handle ?? null,
  });
  const c = await db.company.create({
    data: {
      slug: "idn-demo", name: "IDN demo", seedJson: toSeedJson(writes.seedJson) as object,
      users: { create: [person("B. Hartmann", "manager"), person("T. Vogel", "leader"), person("J. Schmidt", "member", "Anonymous #4471")] },
    },
  });
  companyId = c.id;
  await writeStructure(c.id, writes, "test");
});

afterAll(async () => {
  await db.company.deleteMany({ where: { slug: "idn-demo" } });
  await db.$disconnect();
});

describe("IDN demo company bound", () => {
  it("links seats to users and binds the stored seed, and a second run changes nothing", async () => {
    const first = await bindDemoCompany(companyId);
    expect(first.seatsLinked).toBeGreaterThan(0);

    const users = await db.user.findMany({ where: { companyId }, select: { id: true, name: true } });
    const idOf = (n: string) => users.find((u) => u.name === n)!.id;
    const holder = await db.orgRoleHolder.findFirst({ where: { companyId, name: "T. Vogel" } });
    expect(holder?.userId).toBe(idOf("T. Vogel"));

    const row = await db.company.findUnique({ where: { id: companyId }, select: { seedJson: true } });
    const stored = parseSeed(row!.seedJson);
    const c3 = stored.cases.find((c) => c.id === "c3")!;
    expect(c3.fromUserId).toBe(idOf("J. Schmidt"));
    expect(c3.assigneeRoleHolderId).toBeTruthy();
    expect(stored.seats).toEqual([]);
    expect((row!.seedJson as { seats: unknown[] }).seats).toEqual([]);

    const second = await bindDemoCompany(companyId);
    expect(second.seatsLinked).toBe(0);
    const again = await db.company.findUnique({ where: { id: companyId }, select: { seedJson: true } });
    expect(again!.seedJson).toEqual(row!.seedJson);
  });
});
