// FX3 against Postgres: a directory member (a department, a manager, no seat) has a unit for audiences and
// metrics, and their leader gets their case in the stored access keys.
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { toSeedJson } from "@/features/demo/parse";
import { SEED } from "@/features/demo/seed";
import { getDb } from "@/lib/db/client";
import { appendEventRow } from "@/lib/db/events";
import { ledgerInputs } from "@/lib/db/metrics";
import { visibleTo } from "@/lib/db/projections/visible";

const db = getDb();
let companyId = "";
const ids = { unit: "", other: "", head: "", leader: "", boss: "", managed: "", plain: "", gone: "" };

async function raise(id: string, userId: string) {
  const r = await appendEventRow(
    companyId,
    { id: crypto.randomUUID(), day: 0, type: "case.raised", actor: "x", targetId: id, payload: { title: id, body: "b", routeId: null, assignee: "", fromDept: "PRD", kind: "problem" } },
    { actorUserId: userId },
  );
  expect(r.ok).toBe(true);
}
const keysOf = async (caseId: string) => (await db.caseView.findFirstOrThrow({ where: { companyId, caseId }, select: { accessKeys: true } })).accessKeys;

beforeAll(async () => {
  await db.company.deleteMany({});
  companyId = (await db.company.create({ data: { slug: "fx3-co", name: "FX3", stage: "sandbox", seedJson: toSeedJson(SEED) as object } })).id;
  ids.unit = (await db.orgUnit.create({ data: { companyId, key: "PRD", name: "Production", headcount: 5 } })).id;
  ids.other = (await db.orgUnit.create({ data: { companyId, key: "QUA", name: "Quality", headcount: 5 } })).id;
  ids.head = (await db.orgRole.create({ data: { companyId, orgUnitId: ids.unit, title: "Head" } })).id;
  const user = async (name: string, data: { dept?: string; managerId?: string; active?: boolean; role?: string } = {}) =>
    (await db.user.create({ data: { companyId, name, email: name + "@fx3.example", role: "member", ...data } })).id;
  ids.leader = await user("leader", { role: "leader" });
  await db.orgRoleHolder.create({ data: { companyId, roleId: ids.head, name: "Leader", userId: ids.leader } });
  ids.boss = await user("boss", { role: "leader" });
  ids.gone = await user("gone", { role: "leader", active: false });
  ids.managed = await user("managed", { dept: "PRD", managerId: ids.boss });
  ids.plain = await user("plain", { dept: "production", managerId: ids.gone });
});

afterAll(async () => {
  await db.company.deleteMany({});
  await db.$disconnect();
});

describe("FX3 people without a seat", () => {
  it("carry their department's unit, by key or by name", async () => {
    expect(await visibleTo(companyId, ids.managed)).toContain("n:" + ids.unit);
    expect(await visibleTo(companyId, ids.plain)).toContain("n:" + ids.unit);
    expect(await visibleTo(companyId, ids.managed)).not.toContain("n:" + ids.other);
  });

  it("show their case to their manager", async () => {
    await raise("c-managed", ids.managed);
    expect(await keysOf("c-managed")).toContain("u:" + ids.boss);
  });

  it("whose manager has left show it to the head of their unit", async () => {
    await raise("c-plain", ids.plain);
    const keys = await keysOf("c-plain");
    expect(keys).toContain("r:" + ids.head);
    expect(keys).not.toContain("u:" + ids.gone);
  });

  it("count in their unit's metric cohort, also as the raiser", async () => {
    const { org, cases } = await ledgerInputs(companyId, { from: -1_000_000, to: 1_000_000 });
    expect(org.units.find((u) => u.id === ids.unit)?.people).toBe(3);
    expect(org.units.find((u) => u.id === ids.other)?.people).toBe(0);
    expect(cases.find((c) => c.caseId === "c-managed")?.raiserUnitId).toBe(ids.unit);
  });
});
