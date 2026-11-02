import { afterAll, beforeAll, beforeEach, describe, expect, it, vi } from "vitest";
import type { Viewer } from "@/features/auth/session";
import { SEED } from "@/features/demo/seed";
import { getDb } from "@/lib/db/client";

let viewer: Viewer | null = null;
vi.mock("@/features/auth/session", () => ({ getViewerFor: vi.fn(async (slug: string) => (viewer && viewer.companySlug === slug ? viewer : null)) }));
vi.mock("next/cache", () => ({ revalidatePath: vi.fn() }));

import { retryOutboxAction, saveNotificationsSwitchAction } from "@/server/actions/settings/notifications";

const db = getDb();
const ids: Record<string, { companyId: string; userId: string }> = {};

const asViewer = (key: string, slug: string, role: Viewer["role"]): Viewer => ({
  userId: ids[key].userId, companyId: ids[key].companyId, companySlug: slug, name: key, handle: null, role, epoch: 0, issuedAt: 0,
});
const form = (o: Record<string, string>): FormData => {
  const f = new FormData();
  for (const [k, v] of Object.entries(o)) f.append(k, v);
  return f;
};
const failedRow = (companyId: string, key: string) =>
  db.outboxMessage.create({
    data: { companyId, channel: "mail", key, template: "t", locale: "en", subject: "s", text: "x", status: "failed", attempt: 5, lastError: "boom", nextAt: new Date("2020-01-01") },
  });

beforeAll(async () => {
  await db.company.deleteMany({});
  for (const slug of ["adm-a", "adm-b"]) {
    const c = await db.company.create({ data: { slug, name: slug, mark: "M", seedJson: JSON.parse(JSON.stringify(SEED)), stage: "pilot" } });
    const mk = async (key: string, role: string) => {
      const u = await db.user.create({ data: { companyId: c.id, name: key, email: `${key}@x.example`, role, active: true } });
      ids[key] = { companyId: c.id, userId: u.id };
    };
    if (slug === "adm-a") { await mk("managerA", "manager"); await mk("leaderA", "leader"); } else await mk("managerB", "manager");
  }
});
beforeEach(() => { viewer = null; });
afterAll(async () => {
  await db.company.deleteMany({});
  await db.$disconnect();
});

describe("ADM notifications settings", () => {
  it("saves the switch for the admin's company only", async () => {
    viewer = asViewer("managerA", "adm-a", "manager");
    expect(await saveNotificationsSwitchAction({}, form({ slug: "adm-a", on: "on" }))).toEqual({ ok: true });
    expect((await db.companyConfig.findUniqueOrThrow({ where: { companyId: ids.managerA.companyId } })).notifications).toBe(true);
    expect(await db.companyConfig.count({ where: { companyId: ids.managerB.companyId } })).toBe(0);
    await saveNotificationsSwitchAction({}, form({ slug: "adm-a" }));
    expect((await db.companyConfig.findUniqueOrThrow({ where: { companyId: ids.managerA.companyId } })).notifications).toBe(false);
  });

  it("retries one failed row of that company and nothing else", async () => {
    const a1 = await failedRow(ids.managerA.companyId, "k1");
    const a2 = await failedRow(ids.managerA.companyId, "k2");
    const b1 = await failedRow(ids.managerB.companyId, "k3");
    viewer = asViewer("managerA", "adm-a", "manager");
    expect(await retryOutboxAction({}, form({ slug: "adm-a", id: a1.id }))).toEqual({ ok: true });
    const r = await db.outboxMessage.findUniqueOrThrow({ where: { id: a1.id } });
    expect(r).toMatchObject({ status: "pending", attempt: 0, lastError: "boom", text: "x" });
    expect(r.nextAt.getTime()).toBeGreaterThan(Date.now() - 60_000);
    expect((await db.outboxMessage.findUniqueOrThrow({ where: { id: a2.id } })).status).toBe("failed");
    const other = await retryOutboxAction({}, form({ slug: "adm-a", id: b1.id }));
    expect(other.error).toBe("settingsNotifications.retryGone");
    expect((await db.outboxMessage.findUniqueOrThrow({ where: { id: b1.id } })).status).toBe("failed");
  });

  it("changes nothing for a leader", async () => {
    const row = await failedRow(ids.managerA.companyId, "k4");
    viewer = asViewer("leaderA", "adm-a", "leader");
    expect((await saveNotificationsSwitchAction({}, form({ slug: "adm-a", on: "on" }))).error).toBe("settingsCompany.forbidden");
    expect((await retryOutboxAction({}, form({ slug: "adm-a", id: row.id }))).error).toBe("settingsCompany.forbidden");
    expect((await db.outboxMessage.findUniqueOrThrow({ where: { id: row.id } })).status).toBe("failed");
  });
});
