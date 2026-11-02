import { afterAll, beforeAll, describe, expect, it } from "vitest";
import type { MicrosoftIdentity } from "@/features/auth/entra";
import { SEED } from "@/features/demo/seed";
import { DEMO_GOALS } from "@/features/demo/structure";
import { rowsFromSeed } from "@/features/knowledge";
import { createMicrosoftUser, linkJitSeat } from "@/lib/db/accounts";
import { getDb } from "@/lib/db/client";
import { loadUsersOfRole } from "@/lib/db/holders";
import { replaceKnowledge } from "@/lib/db/knowledge";

const db = getDb();
let company: { id: string };
let engRole = "";

const who = (n: number, name: string, department: string): MicrosoftIdentity => ({
  oid: "oid-" + n, tid: "tid", email: `u${n}@jit.example`, name, roles: [], department,
});

beforeAll(async () => {
  await db.company.deleteMany({});
  company = await db.company.create({ data: { slug: "idn-jit", name: "JIT", seedJson: {} } });
  const k = rowsFromSeed(SEED, DEMO_GOALS, () => crypto.randomUUID());
  await replaceKnowledge(company.id, k);
  // The labels are read here only to find the fixture's role.
  engRole = k.holders.find((h) => h.name === "M. Roth")!.roleId;
});

afterAll(async () => {
  await db.company.deleteMany({});
  await db.$disconnect();
});

describe("IDN JIT account", () => {
  it("gives a member a handle and no seat", async () => {
    const { user, seat } = await createMicrosoftUser(company.id, who(1, "Mia Member", "Engineering"), "member");
    expect(seat).toBe("none");
    const row = await db.user.findFirst({ where: { companyId: company.id, id: user.id } });
    expect(row?.handle).toMatch(/^Anonymous #\d{4}$/);
    expect(await db.orgRoleHolder.count({ where: { companyId: company.id, userId: user.id } })).toBe(0);
  });

  it("seats a leader of Engineering in the lead role, once", async () => {
    const { user, seat } = await createMicrosoftUser(company.id, who(2, "Lena Lead", "Engineering"), "leader");
    expect(seat).toBe("created");
    expect(user.id).toBeTruthy();
    const seats = await db.orgRoleHolder.findMany({ where: { companyId: company.id, userId: user.id } });
    expect(seats).toHaveLength(1);
    expect(seats[0].roleId).toBe(engRole);
    expect(await loadUsersOfRole(company.id, engRole)).toContain(user.id);
    expect((await db.user.findFirst({ where: { companyId: company.id, id: user.id } }))?.handle).toBeNull();

    const before = await db.orgRoleHolder.count({ where: { companyId: company.id } });
    expect(await linkJitSeat(company.id, user, "Engineering")).toBe("kept");
    expect(await db.orgRoleHolder.count({ where: { companyId: company.id } })).toBe(before);
  });

  it("creates no seat for an unknown department", async () => {
    const { user, seat } = await createMicrosoftUser(company.id, who(3, "Max Marketing", "Marketing"), "leader");
    expect(seat).toBe("none");
    expect(await db.orgRoleHolder.count({ where: { companyId: company.id, userId: user.id } })).toBe(0);
  });

  it("labels a leader named like an existing holder with the address", async () => {
    const { user, seat } = await createMicrosoftUser(company.id, who(4, "M. Roth", "ENG"), "manager");
    expect(seat).toBe("created");
    const row = await db.orgRoleHolder.findFirst({ where: { companyId: company.id, userId: user.id } });
    expect(row?.name).toBe("M. Roth (u4@jit.example)");
    expect(row?.roleId).toBe(engRole);
  });
});
