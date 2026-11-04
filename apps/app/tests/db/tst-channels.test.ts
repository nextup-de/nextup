// TST-C1: the channels on a small Musterwerk (D6) against a real Postgres. Teams is set up for the people of one
// site with the fake Bot Framework, each site has a floor area with a QR raise and a status reference, and the
// people without Teams get their notices as mail through the outbox into a captured transport. Then Teams is
// switched off (D3): everyone gets mail and the core loop (raise, route, answer, decide) still passes.
// Time is passed in (2027 dates); mail never leaves through SMTP.
import { afterAll, beforeAll, describe, expect, it, vi } from "vitest";
import { PUBLIC_CONTRACT_VERSION, type NotifyChannel, type NotifyMessage } from "@nextup/contracts/public";
import { POST } from "@/app/api/[company]/teams/messages/route";
import { meFor, usersOfRole } from "@/features/auth/identity";
import { onDeskOf } from "@/features/cases/selectors";
import { reduce } from "@/features/cases/reducer";
import { stampEvent } from "@/features/cases/stamp";
import { getDb } from "@/lib/db/client";
import { companySeed } from "@/lib/db/companies";
import { appendEventRow, loadLog } from "@/lib/db/events";
import { saveArea } from "@/lib/db/floor";
import { loadKnowledge } from "@/lib/db/knowledge";
import { runClockOnce } from "@/server/scheduler/clock";
import { deliverOnce } from "@/server/notify/deliver";
import { dispatchOnce } from "@/server/notify/dispatch";
import { registerChannel } from "@/server/notify/registry";
import { proposeOnRaise } from "@/server/routing";
import { resetBotKeyCache } from "@/server/teams/auth";
import { resetAppToken } from "@/server/teams/connector";
import { generateMusterwerk } from "../../prisma/generators/musterwerk";
import { startFakeBotFramework, type FakeBotFramework } from "../fake-botframework/fake-botframework";

// The floor server code reads cookies; there is no request here.
vi.mock("next/headers", () => ({
  cookies: async () => ({ get: () => undefined, set: () => undefined, delete: () => undefined }),
  headers: async () => new Headers(),
}));
vi.mock("next/cache", () => ({ revalidatePath: vi.fn() }));

import { raiseFromFloor } from "@/server/floor/raise";
import { floorStatus } from "@/server/floor/status";

const db = getDb();
const SLUG = "tst-channels";
const TENANT = "11111111-2222-3333-4444-5555555555cc";
const ENV = ["TEAMS_APP_ID", "TEAMS_APP_PASSWORD", "TEAMS_TENANT_ID", "TEAMS_OPENID_URL", "TEAMS_TOKEN_URL"] as const;
const saved = Object.fromEntries(ENV.map((k) => [k, process.env[k]]));

/** About 09:00 Berlin on a March 2027 day; 1 March is a Monday. Good Friday (26th) and Easter Monday (29th) are holidays in DE-BY. */
const at9 = (day: number): Date => new Date(Date.UTC(2027, 2, day, 8, 0)); // days past 31 roll into April
const NOW = at9(1);
const TEAMS_SITE = "Werk Nord";
const MAIL_SITE = "Werk Süd";

const mail: NotifyMessage[] = [];
const capturedMail: NotifyChannel = {
  info: { kind: "NotifyChannel", id: "mail", contractVersion: PUBLIC_CONTRACT_VERSION },
  async send(m) {
    mail.push(m);
    return { ok: true, providerMessageId: null };
  },
};

let fake: FakeBotFramework;
let companyId = "";
let n = 0;
/** user id -> site name, for every person (a seat or a member). */
const siteOf = new Map<string, string>();
const aadOf = (userId: string) => `aad-${userId}`;

const post = (activity: unknown) =>
  POST(
    new Request(`http://x/api/${SLUG}/teams/messages`, {
      method: "POST",
      headers: { "content-type": "application/json", authorization: `Bearer ${fake.mintToken()}` },
      body: JSON.stringify(activity),
    }),
    { params: Promise.resolve({ company: SLUG }) },
  );
const envelope = (userId: string, conversationType = "personal") => ({
  id: `tstc-act-${++n}`,
  serviceUrl: fake.serviceUrl,
  from: { id: `29:${aadOf(userId)}`, aadObjectId: aadOf(userId) },
  recipient: { id: "28:bot" },
  conversation: { id: `conv-${aadOf(userId)}`, conversationType, tenantId: TENANT },
});

const seedOf = async () => companySeed(await db.company.findUniqueOrThrow({ where: { id: companyId } }));
const stateNow = async () => reduce(await seedOf(), await loadLog(companyId));

/** A raise the way appendEventAction stores it, assigned to a seat. */
async function raise(id: string, now: Date, by: string, routeId: string, seatId: string): Promise<void> {
  const stamped = stampEvent("case.raised", { title: "Scanner " + id, body: "It does not read.", routeId, kind: "problem" }, await seedOf());
  const r = await appendEventRow(
    companyId,
    { id, day: 0, type: "case.raised", actor: "Anonymous #4471", targetId: "c_" + id, payload: { ...stamped, assigneeRoleHolderId: seatId } },
    { actorUserId: by, now },
  );
  expect(r.ok).toBe(true);
}

/** Dispatch and deliver until nothing is left to send. */
async function flush(now: Date): Promise<void> {
  await dispatchOnce(now);
  for (let i = 0; i < 20; i++) {
    const c = await deliverOnce(now);
    if (c.sent + c.retried + c.failed + c.waiting === 0) return;
  }
}

/** One route per site: both ends held by people of that site, plus someone else to raise it. */
type SiteRoute = { routeId: string; ownerSeatId: string; deputyUserId: string };
const routes = new Map<string, SiteRoute>();
let raiserId = "";
const holderAreas = new Map<string, { areaKey: string; deskUserId: string }>();

beforeAll(async () => {
  fake = await startFakeBotFramework();
  Object.assign(process.env, { TEAMS_APP_ID: fake.appId, TEAMS_APP_PASSWORD: fake.password, TEAMS_TENANT_ID: TENANT, TEAMS_OPENID_URL: fake.openIdUrl, TEAMS_TOKEN_URL: fake.tokenUrl });
  resetBotKeyCache();
  resetAppToken();
  registerChannel("mail", capturedMail);

  await db.company.deleteMany({});
  const g = await generateMusterwerk(db, { slug: SLUG, people: 150, weeks: 2, seed: 11, now: NOW });
  companyId = g.companyId;
  // The generator makes a sandbox company, where nothing is sent (NTF D8). The channels run in a pilot company.
  await db.company.update({ where: { id: companyId }, data: { stage: "pilot", entraTenantId: TENANT } });
  await db.companyConfig.upsert({ where: { companyId }, create: { companyId, notifications: true }, update: { notifications: true } });
  await db.integration.create({ data: { companyId, system: "teams", on: true, settings: {} } });

  const k = await loadKnowledge(companyId);
  const unitById = new Map(k.units.map((u) => [u.id, u]));
  const topOf = (unitId: string) => {
    let u = unitById.get(unitId)!;
    while (u.parentId) u = unitById.get(u.parentId)!;
    return u.name;
  };
  const unitByKey = new Map(k.units.map((u) => [u.key, u]));
  for (const u of await db.user.findMany({ where: { companyId }, select: { id: true, dept: true } })) {
    const unit = unitByKey.get(u.dept);
    if (unit) siteOf.set(u.id, topOf(unit.id));
  }
  const roleById = new Map(k.roles.map((r) => [r.id, r]));
  const holderOf = (roleId: string) => k.holders.find((h) => h.roleId === roleId);
  for (const rule of k.rules) {
    const owner = holderOf(rule.ownerRoleId);
    const deputy = rule.deputyRoleId ? holderOf(rule.deputyRoleId) : undefined;
    if (!owner?.userId || !deputy?.userId) continue;
    const site = siteOf.get(deputy.userId);
    if (!site || siteOf.get(owner.userId) !== site || routes.has(site)) continue;
    routes.set(site, { routeId: rule.key, ownerSeatId: owner.id, deputyUserId: deputy.userId });
  }
  const seatUsers = new Set(k.holders.map((h) => h.userId));
  raiserId = (await db.user.findFirstOrThrow({ where: { companyId, role: "member", id: { notIn: [...seatUsers].filter((x): x is string => !!x) } } })).id;

  // A floor area per site: a unit of the site, with a role of that unit that someone holds.
  for (const site of [TEAMS_SITE, MAIL_SITE, "Zentrale"]) {
    const role = k.roles.find((r) => holderOf(r.id)?.userId && siteOf.get(holderOf(r.id)!.userId!) === site && roleById.get(r.id));
    if (!role) throw new Error("no desk in " + site);
    const key = "qr-" + site.toLowerCase().replace(/\W+/g, "-");
    await saveArea(companyId, { key, name: "QR " + site, unitId: role.orgUnitId, roleId: role.id, anonymous: true }, null);
    holderAreas.set(site, { areaKey: key, deskUserId: holderOf(role.id)!.userId! });
  }
}, 180_000);

afterAll(async () => {
  await db.company.deleteMany({});
  await db.rateCounter.deleteMany({});
  await db.$disconnect();
  await fake.close();
  for (const k of ENV) {
    if (saved[k] === undefined) delete process.env[k];
    else process.env[k] = saved[k];
  }
  resetAppToken();
  resetBotKeyCache();
});

describe("TST channels", () => {
  it("the people of one site add the bot and get a conversation; nobody else does", async () => {
    const people = [...siteOf].filter(([, site]) => site === TEAMS_SITE).map(([id]) => id);
    expect(people.length).toBeGreaterThan(20);
    for (const id of people) {
      await db.user.update({ where: { id, companyId }, data: { entraOid: aadOf(id) } });
      const add = { ...envelope(id), type: "conversationUpdate", membersAdded: [{ id: "28:bot" }] };
      expect((await post(add)).status).toBe(200);
    }
    const stored = await db.teamsConversation.findMany({ where: { companyId } });
    expect(new Set(stored.map((c) => c.userId))).toEqual(new Set(people));
  }, 120_000);

  it("a passed deadline reaches a Teams user as a card and the card's answer lands on the case", async () => {
    const route = routes.get(TEAMS_SITE)!;
    await dispatchOnce(NOW); // the first run starts the cursor at the newest event
    await raise("tstc-t1", at9(2), raiserId, route.routeId, route.ownerSeatId);
    for (let d = 3; d <= 19; d++) {
      await runClockOnce(at9(d));
      await flush(at9(d));
    }
    const rows = (await db.outboxMessage.findMany({ where: { companyId, template: "reminder.deadline" } }))
      .filter((r) => (r.data as { subjectId?: string }).subjectId === "c_tstc-t1");
    const mine = rows.filter((r) => r.recipientUserId === route.deputyUserId);
    expect(mine).toHaveLength(1);
    expect(mine[0]).toMatchObject({ channel: "teams", status: "sent", address: null });
    const cards = fake.activities.filter((a) => a.conversationId === `conv-${aadOf(route.deputyUserId)}` && JSON.stringify(a.activity).includes('"caseId":"c_tstc-t1"'));
    expect(cards.some((a) => JSON.stringify(a.activity).includes('"kind":"answer"'))).toBe(true);
    // Everyone of that site got the card, nobody of it got the same notice as mail.
    for (const r of rows) expect(r.channel).toBe(siteOf.get(r.recipientUserId!) === TEAMS_SITE ? "teams" : "mail");
    expect(mail.filter((m) => m.recipient.userId === route.deputyUserId && m.data.subjectId === "c_tstc-t1")).toHaveLength(0);

    const answer = { ...envelope(route.deputyUserId), type: "message", value: { kind: "answer", caseId: "c_tstc-t1", cardId: "card-1", answer: "no", text: "Too costly this quarter" } };
    expect((await post(answer)).status).toBe(200);
    const decided = await db.caseEvent.findMany({ where: { companyId, type: "case.decided", targetId: "c_tstc-t1" } });
    expect(decided).toHaveLength(1);
    expect(decided[0]).toMatchObject({ actorUserId: route.deputyUserId, source: "teams" });
    expect(decided[0].payload).toMatchObject({ answer: "no", reason: "Too costly this quarter" });
    const c = (await stateNow()).cases.find((x) => x.id === "c_tstc-t1");
    expect(c?.decided).toMatchObject({ answer: "no" });
  }, 120_000);

  it("a person without Teams gets the same notice by mail through the outbox", async () => {
    const route = routes.get(MAIL_SITE)!;
    await raise("tstc-m1", at9(22), raiserId, route.routeId, route.ownerSeatId);
    for (let d = 23; d <= 40; d++) {
      await runClockOnce(at9(d));
      await flush(at9(d));
    }
    const rows = await db.outboxMessage.findMany({ where: { companyId, recipientUserId: route.deputyUserId, template: "reminder.deadline" } });
    const mine = rows.filter((r) => (r.data as { subjectId?: string }).subjectId === "c_tstc-m1");
    expect(mine).toHaveLength(1);
    expect(mine[0]).toMatchObject({ channel: "mail", status: "sent" });
    expect(mine[0].address).toMatch(/@musterwerk\.test$/);
    const sent = mail.filter((m) => m.recipient.userId === route.deputyUserId && m.data.subjectId === "c_tstc-m1");
    expect(sent).toHaveLength(1);
    expect(sent[0]).toMatchObject({ template: "reminder.deadline", recipient: { address: mine[0].address } });
    expect(fake.activities.some((a) => a.conversationId === `conv-${aadOf(route.deputyUserId)}`)).toBe(false);
  }, 120_000);

  it("a QR raise from each site's area reaches that area's desk, and its reference shows the answer", async () => {
    let device = 0;
    for (const [site, area] of holderAreas) {
      const res = await raiseFromFloor(SLUG, { area: area.areaKey, kind: "problem", title: "Oil at " + site, body: "Near the press", nonce: `tstcnonce${String(++n).padStart(6, "0")}` }, "anonymous", { key: `a:tstc-dev-${++device}`, deviceId: null });
      if (!res.ok || !res.reference) throw new Error(`floor raise at ${site}: ${JSON.stringify(res)}`);
      const raised = await db.caseEvent.findFirstOrThrow({ where: { companyId, type: "case.raised", source: "floor", payload: { path: ["title"], equals: "Oil at " + site } } });
      expect(raised).toMatchObject({ actor: "system:floor", actorUserId: null });

      let seed = await seedOf();
      const kase = reduce(seed, await loadLog(companyId)).cases.find((x) => x.id === raised.targetId);
      expect(kase, site).toBeTruthy();
      expect(onDeskOf(kase!, meFor(area.deskUserId, seed.seats)), site).toBe(true);

      // The reporter's reference: sent, then the desk decides and the reference shows it.
      expect(await floorStatus(SLUG, res.reference, `a:tstc-look-${device}`)).toMatchObject({ ok: true, view: { step: "sent", decision: null } });
      const d = await appendEventRow(companyId, { id: `e_tstc_dec_${++n}`, day: 0, type: "case.decided", actor: "Desk", targetId: raised.targetId!, payload: { answer: "yes", reason: "Fixed on Monday" } }, { actorUserId: area.deskUserId });
      expect(d.ok).toBe(true);
      seed = await seedOf();
      expect(await floorStatus(SLUG, res.reference, `a:tstc-look-${device}`)).toMatchObject({ ok: true, view: { step: "decided", decision: { answer: "yes", reason: "Fixed on Monday" } } });
    }
    // The desk of the Teams site is told on Teams, the others by mail.
    await flush(at9(41));
    for (const [site, area] of holderAreas) {
      const rows = await db.outboxMessage.findMany({ where: { companyId, recipientUserId: area.deskUserId, template: "raised", subject: { contains: "Oil at " + site } } });
      expect(rows.length, site).toBeGreaterThanOrEqual(1);
      for (const r of rows) expect(r.channel, site).toBe(site === TEAMS_SITE ? "teams" : "mail");
    }
  }, 120_000);

  it("with Teams off everyone gets mail, and raise, route, answer and decide still work", async () => {
    await db.integration.update({ where: { companyId_system: { companyId, system: "teams" } }, data: { on: false } });
    const teamsRowsBefore = await db.outboxMessage.count({ where: { companyId, channel: "teams" } });
    const posted = fake.activities.length;
    const before = mail.length;

    // Raise (routed like the app does), then the notice to a person who has a Teams chat goes out as mail.
    const proposal = await proposeOnRaise(SLUG, companyId, { title: "Pallet jack broken", body: "Wheel is loose.", kind: "problem", fromDept: "", visibility: "everyone" });
    expect(proposal.routeId).not.toBeNull();
    const seed = await seedOf();
    const rule = seed.routes.find((r) => r.id === proposal.routeId)!;
    const ownerSeat = seed.seats.find((s) => s.id === rule.ownerSeatId)!;
    const stamped = stampEvent("case.raised", { title: "Pallet jack broken", body: "Wheel is loose.", routeId: proposal.routeId, kind: "problem" }, seed);
    const raisedAt = at9(42);
    expect((await appendEventRow(companyId, { id: "tstc-off1", day: 0, type: "case.raised", actor: "Anonymous #4471", targetId: "c_tstc-off1", payload: { ...stamped, assigneeRoleHolderId: rule.ownerSeatId } }, { actorUserId: raiserId, now: raisedAt })).ok).toBe(true);
    let c = (await stateNow()).cases.find((x) => x.id === "c_tstc-off1");
    expect(c?.routeId).toBe(proposal.routeId);
    expect(onDeskOf(c!, meFor(usersOfRole(seed.seats, ownerSeat.roleId)[0], seed.seats))).toBe(true);

    // Answer and decide, as the desk and the raiser.
    const deskUser = usersOfRole(seed.seats, ownerSeat.roleId)[0];
    expect((await appendEventRow(companyId, { id: "tstc-off2", day: 0, type: "case.asked", actor: "Desk", targetId: "c_tstc-off1", payload: { text: "Which wheel?" } }, { actorUserId: deskUser, now: at9(42) })).ok).toBe(true);
    expect((await appendEventRow(companyId, { id: "tstc-off3", day: 0, type: "case.answered", actor: "Anonymous #4471", targetId: "c_tstc-off1", payload: { text: "Front left" } }, { actorUserId: raiserId, now: at9(42) })).ok).toBe(true);
    expect((await appendEventRow(companyId, { id: "tstc-off4", day: 0, type: "case.decided", actor: "Desk", targetId: "c_tstc-off1", payload: { answer: "yes", reason: "Replaced today" } }, { actorUserId: deskUser, now: at9(42) })).ok).toBe(true);
    c = (await stateNow()).cases.find((x) => x.id === "c_tstc-off1");
    expect(c?.question?.answer).toBeTruthy();
    expect(c?.decided).toMatchObject({ answer: "yes" });

    // A floor raise at the Teams site's area still works, and its desk holder (who has a Teams chat) gets mail.
    const area = holderAreas.get(TEAMS_SITE)!;
    const res = await raiseFromFloor(SLUG, { area: area.areaKey, kind: "problem", title: "Teams off at the press", body: "", nonce: `tstcnonce${String(++n).padStart(6, "0")}` }, "anonymous", { key: "a:tstc-dev-off", deviceId: null });
    expect(res).toMatchObject({ ok: true });

    await flush(at9(43));
    expect(await db.outboxMessage.count({ where: { companyId, channel: "teams" } })).toBe(teamsRowsBefore);
    expect(fake.activities.length).toBe(posted);
    const rows = await db.outboxMessage.findMany({ where: { companyId, template: "raised", key: { startsWith: "notify:" } }, orderBy: { createdAt: "desc" }, take: 20 });
    const deskRows = rows.filter((r) => r.recipientUserId === area.deskUserId && r.subject.includes("Teams off at the press"));
    expect(deskRows).toHaveLength(1);
    expect(deskRows[0]).toMatchObject({ channel: "mail", status: "sent" });
    expect(mail.length).toBeGreaterThan(before);
    expect(mail.some((m) => m.recipient.userId === area.deskUserId && m.subject.includes("Teams off at the press"))).toBe(true);
    // The routed case's notice to its owner is a mail row too.
    const ownerRows = await db.outboxMessage.findMany({ where: { companyId, recipientUserId: deskUser, template: "raised", key: { startsWith: "notify:tstc-off1" } } });
    expect(ownerRows.every((r) => r.channel === "mail")).toBe(true);
  }, 120_000);
});
