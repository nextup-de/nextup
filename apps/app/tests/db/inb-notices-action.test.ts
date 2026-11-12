// INB-D1: markNoticesReadAction marks only the signed-in viewer's own notices, in their own company; without a session
// it changes nothing. Real Postgres, the session mocked like publish-after-raise.test.ts.
import { afterAll, beforeAll, beforeEach, describe, expect, it, vi } from "vitest";
import type { Viewer } from "@/features/auth/session";
import { toSeedJson } from "@/features/demo/parse";
import { SEED } from "@/features/demo/seed";
import { getDb } from "@/lib/db/client";

let viewer: Viewer | null = null;
vi.mock("@/features/auth/session", () => ({ getViewerFor: vi.fn(async (slug: string) => (viewer && viewer.companySlug === slug ? viewer : null)) }));

const { markNoticesReadAction } = await import("@/server/actions/notices");

const db = getDb();
const SLUG = "inb-action";
const ids = { company: "", ann: "", bob: "" };
const as = (userId: string, name: string): Viewer => ({ userId, companyId: ids.company, companySlug: SLUG, name, handle: null, role: "member", epoch: 0, issuedAt: 0 });
const notice = (key: string, userId: string) =>
  db.outboxMessage.create({ data: { companyId: ids.company, channel: "inapp", key, recipientUserId: userId, template: "raised", locale: "en", subject: "S", text: "T", status: "sent", sentAt: new Date() } });
const unread = (userId: string) => db.outboxMessage.count({ where: { companyId: ids.company, recipientUserId: userId, channel: "inapp", readAt: null } });

beforeAll(async () => {
  await db.company.deleteMany({});
  ids.company = (await db.company.create({ data: { slug: SLUG, name: "Inbox action", stage: "pilot", seedJson: toSeedJson(SEED) as object } })).id;
  const user = async (name: string) => (await db.user.create({ data: { companyId: ids.company, name, email: name.replace(/\W/g, "") + "@inb-action.example", role: "member" } })).id;
  ids.ann = await user("Ann Reader");
  ids.bob = await user("Bob Other");
});
beforeEach(async () => {
  viewer = null;
  await db.outboxMessage.deleteMany({ where: { companyId: ids.company } });
});
afterAll(async () => {
  await db.company.deleteMany({});
  await db.$disconnect();
});

describe("INB notices action", () => {
  it("marks every unread notice of the viewer, and only theirs", async () => {
    await notice("a1", ids.ann);
    await notice("a2", ids.ann);
    await notice("b1", ids.bob);
    viewer = as(ids.ann, "Ann Reader");
    expect(await markNoticesReadAction(SLUG)).toEqual({ ok: true, changed: 2 });
    expect(await unread(ids.ann)).toBe(0);
    expect(await unread(ids.bob)).toBe(1);
  });

  it("marks the given ids, never another person's", async () => {
    const mine = await notice("a1", ids.ann);
    await notice("a2", ids.ann);
    const theirs = await notice("b1", ids.bob);
    viewer = as(ids.ann, "Ann Reader");
    expect(await markNoticesReadAction(SLUG, [mine.id, theirs.id])).toEqual({ ok: true, changed: 1 });
    expect(await unread(ids.ann)).toBe(1);
    expect(await unread(ids.bob)).toBe(1);
    expect(await markNoticesReadAction(SLUG, [])).toEqual({ ok: true, changed: 0 });
  });

  it("changes nothing without a session or for another company's slug", async () => {
    await notice("a1", ids.ann);
    expect(await markNoticesReadAction(SLUG)).toEqual({ ok: false, error: "not signed in" });
    viewer = as(ids.ann, "Ann Reader");
    expect(await markNoticesReadAction("someone-else")).toEqual({ ok: false, error: "not signed in" });
    expect(await unread(ids.ann)).toBe(1);
  });
});
