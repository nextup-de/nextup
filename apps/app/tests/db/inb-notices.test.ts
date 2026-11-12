// INB-B2: a notice is also in the app. dispatchOnce writes the in-app rows as sent next to the mail rows (skipped on
// a sandbox company), deliverOnce never picks them, and a person lists and marks only their own. Real Postgres.
import { afterAll, beforeAll, describe, expect, it, vi } from "vitest";
import { usersOfRole } from "@/features/auth/identity";
import { stampEvent } from "@/features/cases/stamp";
import { templateWrites } from "@/features/demo/content";
import { toSeedJson } from "@/features/demo/parse";
import { companySeed } from "@/lib/db/companies";
import { getDb } from "@/lib/db/client";
import { appendEventRow } from "@/lib/db/events";
import { bindDemoCompany } from "@/lib/db/demo-identity";
import { listNotices, markNoticesRead } from "@/lib/db/notices";
import { writeStructure } from "@/lib/db/structure-writes";
import { deliverOnce } from "@/server/notify/deliver";
import { dispatchOnce } from "@/server/notify/dispatch";

const sent: { to: string; subject: string }[] = [];
vi.mock("@/server/mail", async (orig) => ({
  ...(await orig<typeof import("@/server/mail")>()),
  mailConfigured: () => true,
  sendMail: async (m: { to: string; subject: string }) => {
    sent.push({ to: m.to, subject: m.subject });
    return { ok: true };
  },
}));

const db = getDb();
const SLUG = "inb-notices";
let companyId = "";
let routeId = "";
let raiserId = "";
let ownerIds: string[] = [];
const later = () => new Date(Date.now() + 60_000);

async function raise(id: string): Promise<void> {
  const company = await db.company.findUniqueOrThrow({ where: { id: companyId }, select: { id: true, seedJson: true, stage: true } });
  const seed = await companySeed(company);
  const payload = stampEvent("case.raised", { title: "Scanner " + id, body: "It does not read.", routeId, kind: "problem" }, seed);
  const r = await appendEventRow(companyId, { id, day: 0, type: "case.raised", actor: "Anonymous #4471", targetId: "c_" + id, payload }, { actorUserId: raiserId });
  expect(r.ok).toBe(true);
}

beforeAll(async () => {
  await db.company.deleteMany({});
  const writes = templateWrites("demo", () => crypto.randomUUID());
  const person = (name: string, role: string, handle?: string) => ({
    name, email: name.replace(/\W+/g, "").toLowerCase() + "@inb-notices.example", role, dept: "", ini: "XX", handle: handle ?? null,
  });
  const c = await db.company.create({
    data: {
      slug: SLUG, name: "INB notices", stage: "sandbox", seedJson: toSeedJson(writes.seedJson) as object,
      users: { create: [person("B. Hartmann", "manager"), person("T. Vogel", "leader"), person("J. Schmidt", "member", "Anonymous #4471")] },
    },
  });
  companyId = c.id;
  await writeStructure(c.id, writes, "test");
  await bindDemoCompany(c.id);
  raiserId = (await db.user.findFirstOrThrow({ where: { companyId, name: "J. Schmidt" } })).id;
  const seed = await companySeed({ id: c.id, seedJson: c.seedJson, stage: c.stage });
  for (const r of seed.routes) {
    const seat = seed.seats.find((s) => s.id === r.ownerSeatId);
    const users = seat ? usersOfRole(seed.seats, seat.roleId) : [];
    if (users.length && !users.includes(raiserId)) {
      routeId = r.id;
      ownerIds = users;
      break;
    }
  }
  expect(routeId).not.toBe("");
  // The first run starts the cursor at the newest event: nothing before it sends anything.
  await raise("hist");
  await dispatchOnce();
});

afterAll(async () => {
  await db.company.deleteMany({});
  await db.$disconnect();
});

describe("INB notices in the app", () => {
  it("on a sandbox company a raised case writes the in-app rows as sent next to the skipped mail rows; deliverOnce sends none", async () => {
    await raise("r1");
    await dispatchOnce();
    const rows = await db.outboxMessage.findMany({ where: { companyId, template: "raised", key: { startsWith: "notify:r1" } } });
    const app = rows.filter((r) => r.channel === "inapp");
    const mail = rows.filter((r) => r.channel === "mail");
    expect(app.map((r) => r.recipientUserId).sort()).toEqual([...ownerIds].sort());
    expect(app.every((r) => r.status === "sent" && r.sentAt !== null && r.readAt === null && r.lastError === null && r.address === null)).toBe(true);
    expect(app.every((r) => r.key.endsWith(":app"))).toBe(true);
    expect(mail).toHaveLength(ownerIds.length);
    expect(mail.every((r) => r.status === "skipped" && r.lastError === "sandbox")).toBe(true);

    const before = await db.outboxMessage.findMany({ where: { companyId, channel: "inapp" }, orderBy: { id: "asc" } });
    sent.length = 0;
    const count = await deliverOnce(later());
    expect(count.sent).toBe(0);
    expect(sent).toEqual([]);
    expect(await db.outboxMessage.findMany({ where: { companyId, channel: "inapp" }, orderBy: { id: "asc" } })).toEqual(before);
  });

  it("a second run writes no second copy", async () => {
    const n = await db.outboxMessage.count({ where: { companyId } });
    const hist = await db.caseEvent.findFirstOrThrow({ where: { companyId, id: "hist" } });
    await db.notifyCursor.update({ where: { companyId }, data: { seq: hist.seq } });
    await dispatchOnce();
    expect(await db.outboxMessage.count({ where: { companyId } })).toBe(n);
  });

  it("listNotices returns the viewer's own rows, newest first, and markNoticesRead marks only them", async () => {
    await raise("r2");
    await dispatchOnce();
    expect(ownerIds.length).toBeGreaterThanOrEqual(1);
    const a = ownerIds[0];
    const mine = await listNotices(companyId, a);
    expect(mine.length).toBeGreaterThanOrEqual(2);
    expect(mine.every((r) => r.template === "raised" && r.readAt === null && r.subject !== "" && r.text !== "")).toBe(true);
    expect(Object.keys(mine[0]).sort()).toEqual(["createdAt", "id", "link", "readAt", "subject", "template", "text"]);
    expect(mine.map((r) => r.createdAt.getTime())).toEqual(mine.map((r) => r.createdAt.getTime()).sort((x, y) => y - x));
    expect((await listNotices(companyId, a, { limit: 1 }))).toHaveLength(1);
    expect(await listNotices(companyId, raiserId)).toEqual([]);
    // Somebody else with a notice of their own: a notice to a second person, written by hand.
    const b = (await db.user.findFirstOrThrow({ where: { companyId, id: { notIn: [a, raiserId] } } })).id;
    await db.outboxMessage.create({ data: { companyId, channel: "inapp", key: "inb:other", recipientUserId: b, template: "raised", locale: "en", subject: "S", text: "T", status: "sent", sentAt: new Date() } });
    const theirs = await listNotices(companyId, b);
    expect(theirs).toHaveLength(1);

    // One by id, then all; never another person's row, never another company's.
    expect(await markNoticesRead(companyId, a, [mine[0].id, theirs[0].id])).toBe(1);
    expect((await listNotices(companyId, a)).filter((r) => r.readAt !== null).map((r) => r.id)).toEqual([mine[0].id]);
    expect((await listNotices(companyId, b)).every((r) => r.readAt === null)).toBe(true);
    expect(await markNoticesRead(companyId, a)).toBe(mine.length - 1);
    expect((await listNotices(companyId, a)).every((r) => r.readAt !== null)).toBe(true);
    expect((await listNotices(companyId, b)).every((r) => r.readAt === null)).toBe(true);
    expect(await markNoticesRead("other-company", b)).toBe(0);
    expect((await listNotices(companyId, b)).every((r) => r.readAt === null)).toBe(true);
    // A mail row is not a notice and stays untouched.
    expect(await db.outboxMessage.count({ where: { companyId, channel: "mail", readAt: { not: null } } })).toBe(0);
  });
});
