import { afterAll, beforeAll, beforeEach, describe, expect, it, vi } from "vitest";
import type { Viewer } from "@/features/auth/session";
import { SEED } from "@/features/demo/seed";
import { getDb } from "@/lib/db/client";

let viewer: Viewer | null = null;
vi.mock("@/features/auth/session", () => ({ getViewerFor: vi.fn(async (slug: string) => (viewer && viewer.companySlug === slug ? viewer : null)) }));
vi.mock("next/cache", () => ({ revalidatePath: vi.fn() }));

import { saveNoticeChannelsAction } from "@/server/actions/settings/notifications";

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
const stored = async (key: string) => (await db.companyConfig.findUnique({ where: { companyId: ids[key].companyId } }))?.noticeChannels;

beforeAll(async () => {
  await db.company.deleteMany({});
  const c = await db.company.create({ data: { slug: "inb-s", name: "inb-s", mark: "M", seedJson: JSON.parse(JSON.stringify(SEED)), stage: "pilot" } });
  for (const [key, role] of [["manager", "manager"], ["member", "member"]] as const) {
    const u = await db.user.create({ data: { companyId: c.id, name: key, email: `${key}@x.example`, role, active: true } });
    ids[key] = { companyId: c.id, userId: u.id };
  }
});
beforeEach(() => { viewer = null; });
afterAll(async () => {
  await db.company.deleteMany({});
  await db.$disconnect();
});

describe("INB channel rule saved", () => {
  it("a manager saving the rule for loop as both stores {loop: both}", async () => {
    viewer = asViewer("manager", "inb-s", "manager");
    expect(await saveNoticeChannelsAction("inb-s", {}, form({ "rule:loop": "both", "rule:raised": "sms", "rule:other": "mail" }))).toEqual({ ok: true });
    expect(await stored("manager")).toEqual({ loop: "both" });
    const audit = await db.auditEvent.findFirst({ where: { companyId: ids.manager.companyId, action: "audit.settings.notifications" } });
    expect(audit?.changes).toMatchObject({ "noticeChannels.loop": { before: "teams-else-mail", after: "both" } });
  });

  it("a manager can put a group back to the default", async () => {
    viewer = asViewer("manager", "inb-s", "manager");
    await saveNoticeChannelsAction("inb-s", {}, form({ "rule:loop": "mail", "rule:digest": "mail" }));
    expect(await stored("manager")).toEqual({ loop: "mail", digest: "mail" });
    await saveNoticeChannelsAction("inb-s", {}, form({ "rule:loop": "teams-else-mail", "rule:digest": "mail" }));
    expect(await stored("manager")).toEqual({ digest: "mail" });
  });

  it("a member cannot, and nobody signed in cannot", async () => {
    viewer = asViewer("manager", "inb-s", "manager");
    await saveNoticeChannelsAction("inb-s", {}, form({ "rule:loop": "both" }));
    viewer = asViewer("member", "inb-s", "member");
    expect((await saveNoticeChannelsAction("inb-s", {}, form({ "rule:loop": "mail" }))).error).toBe("settingsCompany.forbidden");
    viewer = null;
    expect((await saveNoticeChannelsAction("inb-s", {}, form({ "rule:loop": "mail" }))).error).toBe("settingsCompany.forbidden");
    expect(await stored("manager")).toEqual({ loop: "both" });
  });
});
