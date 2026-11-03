// GDP-S1: the Data and privacy page's actions against a real Postgres (D16, D17, D18).
import { afterAll, beforeAll, beforeEach, describe, expect, it, vi } from "vitest";
import type { Viewer } from "@/features/auth/session";
import { SEED } from "@/features/demo/seed";
import { toSeedJson } from "@/features/demo/parse";
import { getDb } from "@/lib/db/client";

let viewer: Viewer | null = null;
vi.mock("@/features/auth/session", () => ({ getViewerFor: vi.fn(async (slug: string) => (viewer && viewer.companySlug === slug ? viewer : null)) }));
vi.mock("next/cache", () => ({ revalidatePath: vi.fn() }));

import {
  loadPrivacyPage, previewRetention, reportScreenshotsAllowed, saveRetentionAction, saveScreenshotsAction,
} from "@/server/actions/settings/privacy";

const db = getDb();
type Co = { id: string; slug: string; manager: string; member: string };
let acme: Co;
let globex: Co;

async function makeCompany(slug: string): Promise<Co> {
  const c = await db.company.create({ data: { slug, name: `Co ${slug}`, stage: "pilot", seedJson: toSeedJson(SEED) as object } });
  const mk = (role: string) => db.user.create({ data: { companyId: c.id, name: `${role} ${slug}`, email: `${role}@${slug}.test`, role }, select: { id: true } });
  return { id: c.id, slug, manager: (await mk("manager")).id, member: (await mk("member")).id };
}
const as = (c: Co, userId: string, role: Viewer["role"]): Viewer => ({
  userId, companyId: c.id, companySlug: c.slug, name: "x", handle: null, role, epoch: 0, issuedAt: 0,
});
const audit = (c: Co, action: string) => db.auditEvent.findMany({ where: { companyId: c.id, action } });
const rules = { assist_turns: 30, idea_drafts: 180, closed_cases: 720 };

beforeAll(async () => {
  await db.company.deleteMany({});
  acme = await makeCompany("acme");
  globex = await makeCompany("globex");
});
beforeEach(() => { viewer = null; });
afterAll(async () => {
  await db.company.deleteMany({});
  await db.$disconnect();
});

describe("GDP privacy settings", () => {
  it("a manager saves the rules: two rows and one audit row with before and after", async () => {
    viewer = as(acme, acme.manager, "manager");
    expect(await saveRetentionAction("acme", rules)).toEqual({ ok: true });
    const rows = await db.retentionRule.findMany({ where: { companyId: acme.id }, orderBy: { kind: "asc" } });
    expect(rows.map((r) => [r.kind, r.keepDays])).toEqual([["assist_turns", 30], ["closed_cases", 720]]);
    const logged = await audit(acme, "audit.privacy.retention");
    expect(logged).toHaveLength(1);
    expect(logged[0].actorUserId).toBe(acme.manager);
    expect(logged[0].changes).toEqual({ assist_turns: { before: 90, after: 30 }, closed_cases: { before: null, after: 720 } });
    // saving the same values again changes nothing
    expect(await saveRetentionAction("acme", rules)).toEqual({ ok: true });
    expect(await audit(acme, "audit.privacy.retention")).toHaveLength(1);
  });

  it("refuses a value outside the limits and writes nothing", async () => {
    viewer = as(acme, acme.manager, "manager");
    const r = await saveRetentionAction("acme", { ...rules, assist_turns: 6 });
    expect(r).toMatchObject({ ok: false, error: "invalid", fields: { assist_turns: "retentionTooShort" } });
    expect(await audit(acme, "audit.privacy.retention")).toHaveLength(1);
  });

  it("the preview counts what a shorter rule would remove", async () => {
    viewer = as(acme, acme.manager, "manager");
    const user = acme.manager;
    await db.assistTurn.create({ data: { companyId: acme.id, userId: user, sessionId: "s", role: "user", text: "old", createdAt: new Date(Date.now() - 40 * 86_400_000) } });
    expect(await previewRetention("acme", "assist_turns", 30)).toBe(1);
    expect(await previewRetention("acme", "assist_turns", 6)).toBeNull();
  });

  it("turning screenshots off stores false and writes one audit row", async () => {
    viewer = as(acme, acme.manager, "manager");
    expect(await reportScreenshotsAllowed("acme")).toBe(true);
    expect(await saveScreenshotsAction("acme", false)).toEqual({ ok: true });
    expect((await db.privacyPolicy.findUniqueOrThrow({ where: { companyId: acme.id } })).reportScreenshots).toBe(false);
    const logged = await audit(acme, "audit.privacy.screenshots");
    expect(logged).toHaveLength(1);
    expect(logged[0].changes).toEqual({ reportScreenshots: { before: true, after: false } });
    viewer = as(acme, acme.member, "member");
    expect(await reportScreenshotsAllowed("acme")).toBe(false); // any signed-in person of the company
  });

  it("loadPrivacyPage lists the company's exports and the last run, not another company's", async () => {
    const mkExport = (c: Co) =>
      db.dataExport.create({ data: { companyId: c.id, kind: "company", requestedByUserId: c.manager, deliverTo: "admin", status: "ready", expiresAt: new Date(Date.now() + 86_400_000) } });
    const mine = await mkExport(acme);
    await mkExport(globex);
    await db.retentionRun.upsert({
      where: { companyId: acme.id },
      create: { companyId: acme.id, lastRunAt: new Date(), lastOkAt: new Date(), removed: { assistTurns: 4, drafts: 2, cases: 1 } },
      update: { lastRunAt: new Date(), lastOkAt: new Date(), removed: { assistTurns: 4, drafts: 2, cases: 1 } },
    });
    viewer = as(acme, acme.manager, "manager");
    const data = await loadPrivacyPage("acme");
    expect(data?.exports.map((e) => e.id)).toEqual([mine.id]);
    expect(data?.lastRun?.removed).toMatchObject({ assistTurns: 4, drafts: 2, cases: 1 });
    expect(data?.rules).toEqual(rules);
    expect(data?.reportScreenshots).toBe(false);
    expect(JSON.stringify(data)).not.toContain("employeeId");
  });

  it("a member and another company's manager read and change nothing", async () => {
    const before = { rules: await db.retentionRule.count(), audit: await db.auditEvent.count() };
    for (const v of [as(acme, acme.member, "member"), as(globex, globex.manager, "manager")]) {
      viewer = v;
      expect(await loadPrivacyPage("acme")).toBeNull();
      expect(await saveRetentionAction("acme", { ...rules, assist_turns: 60 })).toMatchObject({ ok: false, error: "forbidden" });
      expect(await saveScreenshotsAction("acme", true)).toMatchObject({ ok: false, error: "forbidden" });
      expect(await previewRetention("acme", "assist_turns", 30)).toBeNull();
    }
    expect({ rules: await db.retentionRule.count(), audit: await db.auditEvent.count() }).toEqual(before);
    expect((await db.privacyPolicy.findUniqueOrThrow({ where: { companyId: acme.id } })).reportScreenshots).toBe(false);
  });
});
