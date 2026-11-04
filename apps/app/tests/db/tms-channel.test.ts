// TMS-C1 (D9, D10, D17): a raise or a reminder for a person with a Teams chat becomes a teams outbox row and a card
// in the fake Bot Framework. Against a real Postgres.
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { usersOfRole } from "@/features/auth/identity";
import { stampEvent } from "@/features/cases/stamp";
import { templateWrites } from "@/features/demo/content";
import { toSeedJson } from "@/features/demo/parse";
import { companySeed } from "@/lib/db/companies";
import { getDb } from "@/lib/db/client";
import { appendEventRow } from "@/lib/db/events";
import { bindDemoCompany } from "@/lib/db/demo-identity";
import { writeStructure } from "@/lib/db/structure-writes";
import { saveConversation } from "@/lib/db/teams";
import { deliverOnce } from "@/server/notify/deliver";
import { dispatchOnce } from "@/server/notify/dispatch";
import { resetAppToken } from "@/server/teams/connector";
import { startFakeBotFramework, type FakeBotFramework } from "../fake-botframework/fake-botframework";

const db = getDb();
const SLUG = "tms-channel";
const ENV = ["TEAMS_APP_ID", "TEAMS_APP_PASSWORD", "TEAMS_TENANT_ID", "TEAMS_OPENID_URL", "TEAMS_TOKEN_URL"] as const;
const saved = Object.fromEntries(ENV.map((k) => [k, process.env[k]]));
let fake: FakeBotFramework;
let companyId = "";
let routeId = "";
let raiserId = "";
let holderId = "";
let seatId = "";
const later = () => new Date(Date.now() + 60_000);
const teamsRows = (prefix: string) => db.outboxMessage.findMany({ where: { companyId, channel: "teams", key: { startsWith: prefix } }, orderBy: { key: "asc" } });
const cardOf = (a: { activity: unknown }) => (a.activity as { attachments: { content: { body: { text?: string }[]; actions: { title: string }[] } }[] }).attachments[0].content;

async function raise(id: string): Promise<void> {
  const company = await db.company.findUniqueOrThrow({ where: { id: companyId }, select: { id: true, seedJson: true, stage: true } });
  const payload = stampEvent("case.raised", { title: "Scanner " + id, body: "It does not read.", routeId, kind: "problem" }, await companySeed(company));
  const r = await appendEventRow(companyId, { id, day: 0, type: "case.raised", actor: "Anonymous #4471", targetId: "c_" + id, payload }, { actorUserId: raiserId });
  expect(r.ok).toBe(true);
}

beforeAll(async () => {
  fake = await startFakeBotFramework();
  Object.assign(process.env, { TEAMS_APP_ID: fake.appId, TEAMS_APP_PASSWORD: fake.password, TEAMS_TENANT_ID: "tenant-1", TEAMS_OPENID_URL: fake.openIdUrl, TEAMS_TOKEN_URL: fake.tokenUrl });
  resetAppToken();
  await db.company.deleteMany({});
  const writes = templateWrites("demo", () => crypto.randomUUID());
  const person = (name: string, role: string, handle?: string) => ({
    name, email: name.replace(/\W+/g, "").toLowerCase() + "@tms-channel.example", role, dept: "", ini: "XX", handle: handle ?? null,
  });
  const c = await db.company.create({
    data: {
      slug: SLUG, name: "TMS channel", entraTenantId: "tenant-1", seedJson: toSeedJson(writes.seedJson) as object,
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
    if (seat && users.length && !users.includes(raiserId)) {
      routeId = r.id;
      seatId = seat.id;
      holderId = users[0];
      break;
    }
  }
  expect(routeId).not.toBe("");
  await db.companyConfig.upsert({ where: { companyId }, create: { companyId, notifications: true }, update: { notifications: true } });
  await db.integration.create({ data: { companyId, system: "teams", on: true, settings: {} } });
  await saveConversation(companyId, { userId: holderId, aadObjectId: "aad-1", tenantId: "tenant-1", conversationId: "conv-1", serviceUrl: fake.serviceUrl });
  await dispatchOnce(); // the cursor starts at the newest event
});

afterAll(async () => {
  await db.company.deleteMany({});
  await db.$disconnect();
  await fake.close();
  for (const k of ENV) {
    if (saved[k] === undefined) delete process.env[k];
    else process.env[k] = saved[k];
  }
  resetAppToken();
});

describe("TMS channel", () => {
  it("a raise for a holder with a chat is one teams row; deliverOnce sends a raised card and notes the case", async () => {
    await raise("t1");
    await dispatchOnce();
    const rows = await teamsRows("notify:t1");
    expect(rows).toHaveLength(1);
    expect(rows[0]).toMatchObject({ recipientUserId: holderId, address: null, status: "pending", template: "raised" });

    const count = await deliverOnce(later());
    expect(count.sent).toBeGreaterThanOrEqual(1);
    const sent = fake.activities.filter((a) => a.conversationId === "conv-1");
    expect(sent).toHaveLength(1);
    expect(cardOf(sent[0]).body.some((b) => b.text?.includes("Scanner t1"))).toBe(true);
    expect(cardOf(sent[0]).actions.length).toBeGreaterThan(0);
    const row = await db.outboxMessage.findUniqueOrThrow({ where: { id: rows[0].id } });
    expect(row.status).toBe("sent");
    const noted = await db.caseEvent.findMany({ where: { companyId, targetId: "c_t1", type: "case.commented" } });
    expect(noted).toHaveLength(1);
  });

  it("a deadline reminder arrives as a reminder card", async () => {
    const before = fake.activities.length;
    const r = await appendEventRow(companyId, { id: "d1", day: 0, type: "clock.due", actor: "system:clock", targetId: "c_t1", payload: { kind: "deadline", dueDay: 3, toRoleHolderId: seatId } });
    expect(r.ok).toBe(true);
    await dispatchOnce();
    const rows = await teamsRows("rem:d1");
    expect(rows).toHaveLength(1);
    await deliverOnce(later());
    const got = fake.activities.slice(before);
    expect(got).toHaveLength(1);
    expect(JSON.stringify(got[0].activity)).toContain('"kind":"answer"');
    expect(rows[0].template).toBe("reminder.deadline");
  });

  it("a recipient without a conversation fails without retry", async () => {
    const other = await db.user.findFirstOrThrow({ where: { companyId, id: { not: holderId } } });
    await db.outboxMessage.create({
      data: { companyId, channel: "teams", key: "tms:noconv", recipientUserId: other.id, address: null, template: "digest", locale: "en", subject: "s", text: "t", status: "pending", data: {} },
    });
    await deliverOnce(later());
    const row = await db.outboxMessage.findFirstOrThrow({ where: { companyId, key: "tms:noconv" } });
    expect(row.status).toBe("failed");
    expect(row.lastError).toContain("no Teams chat");
  });

  it("a 503 from the fake is retried", async () => {
    await db.outboxMessage.create({
      data: { companyId, channel: "teams", key: "tms:503", recipientUserId: holderId, address: null, template: "digest", locale: "en", subject: "s", text: "t", status: "pending", data: {} },
    });
    fake.failNext(503);
    await deliverOnce(later());
    const row = await db.outboxMessage.findFirstOrThrow({ where: { companyId, key: "tms:503" } });
    expect(row.status).toBe("pending");
    expect(row.attempt).toBe(1);
    expect(row.lastError).toContain("503");
  });
});
