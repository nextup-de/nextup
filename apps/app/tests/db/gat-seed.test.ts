// GAT-G1: the company's review and approval settings and its managers reach the seed through companySeed (plan GAT, D16, D27).
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { approvalConfigRows } from "@/features/approvals/config";
import { EMPTY_APPROVAL_CONFIG, type ApprovalConfig } from "@/features/approvals/types";
import { SEED } from "@/features/demo/seed";
import { loadApprovalConfig } from "@/lib/db/approvals-config";
import { getDb } from "@/lib/db/client";
import { companySeed } from "@/lib/db/companies";
import { saveCompanyRules } from "@/lib/db/rules";
import { DEFAULT_RULES } from "@/features/knowledge/rules";

const db = getDb();
let a: { id: string; seedJson: unknown };
let b: { id: string; seedJson: unknown };

const CONFIG: ApprovalConfig = {
  review: { on: true, roleId: "role_rev", days: 3, deputyRoleId: null, routes: { r1: "always" } },
  triageRoleId: "role_triage", fallbackRoleId: "role_fallback", approvalDays: 7,
  rules: [{ id: "ru1", kind: "role", roleId: "role_fin", routeKey: null, minEur: 5000 }],
  councils: [{ id: "k1", name: "Council", memberRoleIds: ["role_a"], secretaryRoleId: "role_a", everyDays: 10, firstDay: 20 }],
};

beforeAll(async () => {
  await db.company.deleteMany({});
  a = await db.company.create({ data: { slug: "gat-a", name: "A", seedJson: JSON.parse(JSON.stringify(SEED)) } });
  b = await db.company.create({ data: { slug: "gat-b", name: "B", seedJson: JSON.parse(JSON.stringify(SEED)) } });
  const user = (companyId: string, name: string, role: string, active = true) =>
    db.user.create({ data: { companyId, name, email: `${name}@gat.example`, role, active } });
  await user(a.id, "boss", "manager");
  await user(a.id, "leader", "leader");
  await user(a.id, "gone", "manager", false);
  await user(b.id, "other", "manager");
  await db.companyRule.createMany({ data: approvalConfigRows(CONFIG).map((r) => ({ companyId: a.id, key: r.key, value: r.value as never })) });
});

afterAll(async () => {
  await db.company.deleteMany({});
  await db.$disconnect();
});

describe("GAT seed", () => {
  it("loads the approval config of the company, and only its own", async () => {
    expect(await loadApprovalConfig(a.id)).toEqual(CONFIG);
    expect(await loadApprovalConfig(b.id)).toEqual(EMPTY_APPROVAL_CONFIG);
  });

  it("companySeed carries the config and the active managers' user ids", async () => {
    const seed = await companySeed({ ...a, stage: "demo" });
    expect(seed.approvals).toEqual(CONFIG);
    const boss = await db.user.findFirstOrThrow({ where: { companyId: a.id, name: "boss" }, select: { id: true } });
    expect(seed.managerUserIds).toEqual([boss.id]); // not the leader, not the inactive manager, not another company's
    const other = await companySeed({ ...b, stage: "demo" });
    expect(other.approvals).toEqual(EMPTY_APPROVAL_CONFIG);
    expect(other.managerUserIds).toHaveLength(1);
  });

  it("saving the company rules leaves the approval rows alone (D7)", async () => {
    await saveCompanyRules(a.id, { ...DEFAULT_RULES, promiseDays: 6 });
    expect(await loadApprovalConfig(a.id)).toEqual(CONFIG);
  });
});
