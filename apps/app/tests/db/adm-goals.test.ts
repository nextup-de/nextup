import { afterAll, beforeAll, beforeEach, describe, expect, it, vi } from "vitest";
import type { Viewer } from "@/features/auth/session";
import { toSeedJson } from "@/features/demo/parse";
import { SEED } from "@/features/demo/seed";
import { getDb } from "@/lib/db/client";
import { companySeed } from "@/lib/db/companies";
import { loadKnowledge } from "@/lib/db/knowledge";

let viewer: Viewer | null = null;
vi.mock("@/features/auth/session", () => ({ getViewerFor: vi.fn(async () => viewer) }));
vi.mock("next/cache", () => ({ revalidatePath: vi.fn() }));

import { addGoalAction, removeGoalAction, updateGoalAction } from "@/server/actions/settings/goals";

const db = getDb();
type Co = { id: string; slug: string; admin: string; leader: string; unit: string; goal: string };
const co: Record<"a" | "b", Co> = { a: null as never, b: null as never };

const asViewer = (c: Co, userId: string, role: Viewer["role"]): Viewer => ({
  userId, companyId: c.id, companySlug: c.slug, name: "Admin " + c.slug, handle: null, role, epoch: 0, issuedAt: 0,
});

async function makeCompany(slug: string): Promise<Co> {
  const c = await db.company.create({ data: { slug, name: slug, seedJson: toSeedJson(SEED) as object } });
  const mk = (name: string, role: string) =>
    db.user.create({ data: { companyId: c.id, name, email: `${name}@${slug}.example`, role }, select: { id: true } });
  const [admin, leader] = [await mk("admin", "manager"), await mk("leader", "leader")];
  const u = await db.orgUnit.create({ data: { companyId: c.id, key: "OPS", name: "Operations", kind: "dept", headcount: 2, sort: 0 } });
  const g = await db.goal.create({ data: { companyId: c.id, title: "Existing", keywords: ["x"], sort: 0 } });
  return { id: c.id, slug, admin: admin.id, leader: leader.id, unit: u.id, goal: g.id };
}

const goalsOf = (companyId: string) => db.goal.findMany({ where: { companyId }, orderBy: { id: "asc" } });
const input = (over: Partial<Parameters<typeof addGoalAction>[1]> = {}) =>
  ({ title: "Faster handovers", kpi: "Days", target: "2", period: "Q4 2026", orgUnitId: null, keywords: ["handover", " speed "], ...over });

beforeAll(async () => {
  await db.company.deleteMany({});
  co.a = await makeCompany("adm-goals-a");
  co.b = await makeCompany("adm-goals-b");
});
beforeEach(() => { viewer = null; });
afterAll(async () => {
  await db.company.deleteMany({});
  await db.$disconnect();
});

describe("ADM goals editor", () => {
  it("a leader's call writes nothing", async () => {
    viewer = asViewer(co.a, co.a.leader, "leader");
    const before = JSON.stringify(await goalsOf(co.a.id));
    expect(await addGoalAction(co.a.slug, input())).toEqual({ ok: false, error: "settingsGoals.errForbidden" });
    expect(await updateGoalAction(co.a.slug, co.a.goal, input())).toEqual({ ok: false, error: "settingsGoals.errForbidden" });
    expect(await removeGoalAction(co.a.slug, co.a.goal)).toEqual({ ok: false, error: "settingsGoals.errForbidden" });
    expect(JSON.stringify(await goalsOf(co.a.id))).toBe(before);
  });

  it("an admin adds, changes and removes goals of their company only; companySeed reads them back", async () => {
    const otherBefore = JSON.stringify(await goalsOf(co.b.id));
    viewer = asViewer(co.a, co.a.admin, "manager");
    const slug = co.a.slug;

    expect(await addGoalAction(slug, input({ orgUnitId: co.a.unit }))).toEqual({ ok: true });
    const added = (await goalsOf(co.a.id)).find((g) => g.title === "Faster handovers")!;
    expect(added).toMatchObject({ orgUnitId: co.a.unit, keywords: ["handover", "speed"], updatedBy: "Admin " + slug });

    // A unit of the other company is refused; so is another company's goal.
    expect(await addGoalAction(slug, input({ orgUnitId: co.b.unit }))).toEqual({ ok: false, error: "settingsGoals.errUnit" });
    expect(await updateGoalAction(slug, co.b.goal, input())).toEqual({ ok: false, error: "settingsGoals.errNotFound" });
    expect(await removeGoalAction(slug, co.b.goal)).toEqual({ ok: false, error: "settingsGoals.errNotFound" });

    expect(await updateGoalAction(slug, added.id, input({ title: "Renamed", keywords: ["renamed"] }))).toEqual({ ok: true });
    const seed = await companySeed(await db.company.findUniqueOrThrow({ where: { id: co.a.id } }));
    expect(seed.goals).toContainEqual({ goal: "Renamed", keys: ["renamed"] });
    expect(seed.goals.map((g) => g.goal)).not.toContain("Faster handovers");

    expect(await removeGoalAction(slug, added.id)).toEqual({ ok: true });
    expect((await loadKnowledge(co.a.id)).goals.map((g) => g.title)).toEqual(["Existing"]);

    expect(JSON.stringify(await goalsOf(co.b.id))).toBe(otherBefore);
  });
});
