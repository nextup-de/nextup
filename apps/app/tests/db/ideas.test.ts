// The idea studio's drafts against a real Postgres: a draft is its author's alone, the tenant
// guard covers both tables, publishing happens once, and discarded drafts are purged.
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { SEED } from "@/features/demo/seed";
import { toSeedJson } from "@/features/demo/parse";
import { getDb, TenantScopeError } from "@/lib/db/client";
import { addTurns, createDraft, discardDraft, getDraft, ideaStats, listDrafts, loadPublishThreshold, markPublished, purgeDiscardedDrafts, saveDraftMeta } from "@/lib/db/ideas";

const db = getDb();
let acme: { id: string };
let globex: { id: string };
let ann: { id: string };
let bob: { id: string };
let eve: { id: string };
const snap = (title: string, overall: number) => ({ title, overall, scores: [] });

beforeAll(async () => {
  await db.company.deleteMany({});
  acme = await db.company.create({ data: { slug: "acme", name: "Acme", seedJson: toSeedJson(SEED) as object } });
  globex = await db.company.create({ data: { slug: "globex", name: "Globex", seedJson: toSeedJson(SEED) as object } });
  ann = await db.user.create({ data: { companyId: acme.id, name: "J. Schmidt", email: "ann@acme.test", role: "member" } });
  bob = await db.user.create({ data: { companyId: acme.id, name: "T. Vogel", email: "bob@acme.test", role: "leader" } });
  eve = await db.user.create({ data: { companyId: globex.id, name: "E. Vil", email: "eve@globex.test", role: "member" } });
});

afterAll(async () => {
  await db.company.deleteMany({});
  await db.$disconnect();
});

describe("idea drafts", () => {
  it("belong to their author: not listed, read or changed by anyone else", async () => {
    const id = await createDraft(acme.id, ann.id);
    expect(await addTurns(acme.id, ann.id, id, [{ role: "user", text: "Fixed rig day" }, { role: "assistant", text: "Which goal?", overall: 31 }], snap("Fixed rig day", 31))).toBe(true);

    expect((await listDrafts(acme.id, ann.id)).map((d) => d.title)).toEqual(["Fixed rig day"]);
    expect(await listDrafts(acme.id, bob.id)).toEqual([]); // not even the team lead
    expect(await getDraft(acme.id, bob.id, id)).toBeNull();
    expect(await getDraft(globex.id, eve.id, id)).toBeNull();
    expect(await addTurns(acme.id, bob.id, id, [{ role: "user", text: "hijack" }], snap("x", 99))).toBe(false);
    expect(await saveDraftMeta(globex.id, eve.id, id, { title: "x" })).toBe(false);

    const d = await getDraft(acme.id, ann.id, id);
    expect(d?.turns.map((t) => [t.role, t.text, t.overall])).toEqual([["user", "Fixed rig day", null], ["assistant", "Which goal?", 31]]);
    expect(d?.overall).toBe(31);
  });

  it("publishes once, and a published draft takes no more turns", async () => {
    const id = await createDraft(acme.id, ann.id);
    expect(await markPublished(acme.id, ann.id, id, "c_test1", snap("Ready", 74))).toBe(true);
    expect(await markPublished(acme.id, ann.id, id, "c_test2", snap("Again", 80))).toBe(false);
    expect(await addTurns(acme.id, ann.id, id, [{ role: "user", text: "more" }], snap("x", 1))).toBe(false);
    const d = await getDraft(acme.id, ann.id, id);
    expect([d?.status, d?.caseId, d?.overall]).toEqual(["published", "c_test1", 74]);
  });

  it("discarded drafts vanish from the list and are purged after retention", async () => {
    const id = await createDraft(acme.id, ann.id);
    expect(await discardDraft(acme.id, ann.id, id)).toBe(true);
    expect((await listDrafts(acme.id, ann.id)).some((d) => d.id === id)).toBe(false);
    expect(await purgeDiscardedDrafts(acme.id, 30)).toBe(0); // too young
    expect(await purgeDiscardedDrafts(acme.id, 30, new Date(Date.now() + 31 * 86_400_000))).toBe(1);
  });

  it("counts for /admin, and the threshold defaults to 70", async () => {
    expect(await ideaStats(acme.id)).toEqual({ drafts: 1, published: 1 });
    expect(await loadPublishThreshold(acme.id)).toBe(70);
    await db.companyConfig.create({ data: { companyId: acme.id, publishThreshold: 90 } });
    expect(await loadPublishThreshold(acme.id)).toBe(90);
  });

  it("the tenant guard covers both tables", async () => {
    await expect(db.ideaDraft.findMany({})).rejects.toBeInstanceOf(TenantScopeError);
    await expect(db.ideaTurn.findMany({ where: { draftId: "x" } })).rejects.toBeInstanceOf(TenantScopeError);
  });
});
