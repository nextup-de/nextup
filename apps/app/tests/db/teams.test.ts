// TMS acceptance (TMS-Z1) against a real Postgres and the fake Bot Framework: a person who added the bot gets a
// passed deadline as a reminder card and no mail; answering no on the card appends case.decided with the reason;
// a raise from the message extension creates a case routed like an app raise; with Teams switched off the same
// person gets mail. Mail goes to a channel this test registers (never SMTP). Time is passed in (2027 dates).
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { PUBLIC_CONTRACT_VERSION, type NotifyChannel, type NotifyMessage } from "@nextup/contracts/public";
import { POST } from "@/app/api/[company]/teams/messages/route";
import { usersOfRole } from "@/features/auth/identity";
import { stampEvent } from "@/features/cases/stamp";
import { templateWrites } from "@/features/demo/content";
import { toSeedJson } from "@/features/demo/parse";
import { getDb } from "@/lib/db/client";
import { companySeed } from "@/lib/db/companies";
import { bindDemoCompany } from "@/lib/db/demo-identity";
import { appendEventRow } from "@/lib/db/events";
import { writeStructure } from "@/lib/db/structure-writes";
import { runClockOnce } from "@/server/scheduler/clock";
import { deliverOnce } from "@/server/notify/deliver";
import { dispatchOnce } from "@/server/notify/dispatch";
import { registerChannel } from "@/server/notify/registry";
import { proposeOnRaise } from "@/server/routing";
import { resetBotKeyCache } from "@/server/teams/auth";
import { resetAppToken } from "@/server/teams/connector";
import { startFakeBotFramework, type FakeBotFramework } from "../fake-botframework/fake-botframework";

const db = getDb();
const SLUG = "tmsz-co";
const TENANT = "11111111-2222-3333-4444-5555555555aa";
const HOLDER_AAD = "aad-tmsz-holder";
const MEMBER_AAD = "aad-tmsz-member";
const ENV = ["TEAMS_APP_ID", "TEAMS_APP_PASSWORD", "TEAMS_TENANT_ID", "TEAMS_OPENID_URL", "TEAMS_TOKEN_URL"] as const;
const saved = Object.fromEntries(ENV.map((k) => [k, process.env[k]]));

/** 09:00 Berlin (CET, +01:00) on a March 2027 day. */
const at9 = (day: number): Date => new Date(`2027-03-${String(day).padStart(2, "0")}T09:00:00+01:00`);
const RAISED_AT = at9(1);
const DAYS = Array.from({ length: 10 }, (_, i) => at9(8 + i));

const mail: NotifyMessage[] = [];
const testMail: NotifyChannel = {
  info: { kind: "NotifyChannel", id: "mail", contractVersion: PUBLIC_CONTRACT_VERSION },
  async send(m) {
    mail.push(m);
    return { ok: true, providerMessageId: null };
  },
};

let fake: FakeBotFramework;
let companyId = "";
let routeId = "";
let holderId = "";
let holderSeatId = "";
let memberId = "";
let n = 0;

const post = (activity: unknown) =>
  POST(
    new Request(`http://x/api/${SLUG}/teams/messages`, {
      method: "POST",
      headers: { "content-type": "application/json", authorization: `Bearer ${fake.mintToken()}` },
      body: JSON.stringify(activity),
    }),
    { params: Promise.resolve({ company: SLUG }) },
  );
const envelope = (aad: string, conversationType: string) => ({
  id: `tmsz-act-${++n}`,
  serviceUrl: fake.serviceUrl,
  from: { id: `29:${aad}`, aadObjectId: aad },
  recipient: { id: "28:bot" },
  conversation: { id: `conv-${aad}`, conversationType, tenantId: TENANT },
});

/** A raise the way appendEventAction stores it: the server stamps the seat, the actor user id comes from the session. */
async function raise(id: string, now: Date, seatId?: string): Promise<void> {
  const c = await db.company.findUniqueOrThrow({ where: { id: companyId }, select: { id: true, seedJson: true, stage: true } });
  const stamped = stampEvent("case.raised", { title: "Scanner " + id, body: "It does not read.", routeId, kind: "problem" }, await companySeed(c));
  const payload = seatId ? { ...stamped, assigneeRoleHolderId: seatId } : stamped; // a case that sits with the holder's seat
  const r = await appendEventRow(companyId, { id, day: 0, type: "case.raised", actor: "Anonymous #4471", targetId: "c_" + id, payload }, { actorUserId: memberId, now });
  expect(r.ok).toBe(true);
}

beforeAll(async () => {
  fake = await startFakeBotFramework();
  Object.assign(process.env, { TEAMS_APP_ID: fake.appId, TEAMS_APP_PASSWORD: fake.password, TEAMS_TENANT_ID: TENANT, TEAMS_OPENID_URL: fake.openIdUrl, TEAMS_TOKEN_URL: fake.tokenUrl });
  resetBotKeyCache();
  resetAppToken();
  registerChannel("mail", testMail);

  await db.company.deleteMany({});
  const writes = templateWrites("demo", () => crypto.randomUUID());
  const person = (name: string, role: string, handle?: string) => ({
    name, email: name.replace(/\W+/g, "").toLowerCase() + `@${SLUG}.example`, role, dept: "", ini: "XX", handle: handle ?? null,
  });
  const c = await db.company.create({
    data: {
      slug: SLUG, name: "TMS acceptance", stage: "pilot", entraTenantId: TENANT, seedJson: toSeedJson(writes.seedJson) as object,
      users: { create: [person("B. Hartmann", "manager"), person("T. Vogel", "leader"), person("J. Schmidt", "member", "Anonymous #4471")] },
    },
  });
  companyId = c.id;
  await writeStructure(c.id, writes, "test");
  await bindDemoCompany(c.id);
  await db.companyConfig.upsert({ where: { companyId }, create: { companyId, notifications: true }, update: { notifications: true } });
  await db.integration.create({ data: { companyId, system: "teams", on: true, settings: {} } });

  memberId = (await db.user.findFirstOrThrow({ where: { companyId, name: "J. Schmidt" } })).id;
  const seed = await companySeed({ id: c.id, seedJson: c.seedJson, stage: c.stage });
  // The deadline hands the case to the deputy seat, so the desk holder here is the deputy's person: they get the
  // reminder and are the one the case sits with when they answer.
  for (const r of seed.routes) {
    const owner = seed.seats.find((s) => s.id === r.ownerSeatId);
    const deputy = seed.seats.find((s) => s.roleId === r.deputyRoleId && s.userId);
    if (owner && deputy?.userId && deputy.userId !== memberId && !usersOfRole(seed.seats, owner.roleId).includes(memberId)) {
      routeId = r.id;
      holderId = deputy.userId;
      holderSeatId = deputy.id;
      break;
    }
  }
  expect(routeId).not.toBe("");
  await db.user.update({ where: { id: holderId, companyId }, data: { entraOid: HOLDER_AAD } });
  await db.user.update({ where: { id: memberId, companyId }, data: { entraOid: MEMBER_AAD } });
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
  resetBotKeyCache();
});

describe("TMS acceptance", () => {
  it("TMS acceptance: card reminder, card answer and raise from Teams", async () => {
    // 2. The holder adds the bot: their conversation is stored.
    const add = { ...envelope(HOLDER_AAD, "personal"), type: "conversationUpdate", membersAdded: [{ id: "28:bot" }] };
    expect((await post(add)).status).toBe(200);
    expect(await db.teamsConversation.findFirstOrThrow({ where: { companyId, userId: holderId } })).toMatchObject({ conversationId: `conv-${HOLDER_AAD}` });

    // 3. A raise, its deadline passes on the company clock: the holder gets a reminder card, no mail.
    await dispatchOnce(RAISED_AT); // the first run starts the cursor at the newest event
    await raise("tmsz-r1", RAISED_AT);
    for (const d of DAYS) {
      await runClockOnce(d);
      await dispatchOnce(d);
      await deliverOnce(d);
    }
    const reminders = (await db.outboxMessage.findMany({ where: { companyId, template: "reminder.deadline", recipientUserId: holderId } }))
      .filter((r) => (r.data as { subjectId?: string }).subjectId === "c_tmsz-r1");
    expect(reminders).toHaveLength(1);
    expect(reminders[0]).toMatchObject({ channel: "teams", status: "sent" });
    const cards = fake.activities.filter((a) => a.conversationId === `conv-${HOLDER_AAD}` && JSON.stringify(a.activity).includes('"caseId":"c_tmsz-r1"'));
    expect(cards.length).toBeGreaterThanOrEqual(1);
    expect(cards.some((a) => JSON.stringify(a.activity).includes('"kind":"answer"'))).toBe(true);
    expect(mail.filter((m) => m.recipient.userId === holderId && m.template === "reminder.deadline")).toHaveLength(0);
    expect(await db.outboxMessage.count({ where: { companyId, recipientUserId: holderId, channel: "mail", template: "reminder.deadline" } })).toBe(0);

    // 4. The holder answers no on the card: one case.decided with the reason.
    const answer = { ...envelope(HOLDER_AAD, "personal"), type: "message", value: { kind: "answer", caseId: "c_tmsz-r1", cardId: "card-1", answer: "no", text: "Too costly this quarter" } };
    expect((await post(answer)).status).toBe(200);
    const decided = await db.caseEvent.findMany({ where: { companyId, type: "case.decided", targetId: "c_tmsz-r1" } });
    expect(decided).toHaveLength(1);
    expect(decided[0]).toMatchObject({ actorUserId: holderId, source: "teams" });
    expect(decided[0].payload).toMatchObject({ answer: "no", reason: "Too costly this quarter" });

    // 5. The member raises from the message extension: fetchTask, then submitAction.
    const invoke = (name: string, value: unknown) => ({ ...envelope(MEMBER_AAD, "groupChat"), type: "invoke", name, value });
    const fetched = await post(invoke("composeExtension/fetchTask", { commandId: "raise", commandContext: "compose" }));
    expect(((await fetched.json()) as { task: { type: string } }).task.type).toBe("continue");
    const title = "Coolant leak on line 3";
    const body = "Dripping since the early shift, quality problem.";
    const submit = invoke("composeExtension/submitAction", { commandId: "raise", commandContext: "compose", data: { kind: "problem", visibility: "everyone", title, body } });
    expect(((await (await post(submit)).json()) as { task: { type: string } }).task.type).toBe("message");
    const raised = await db.caseEvent.findMany({ where: { companyId, type: "case.raised", source: "teams" } });
    expect(raised).toHaveLength(1);
    expect(raised[0]).toMatchObject({ actorUserId: memberId, idemKey: `teams:${submit.id}` });
    const company = await db.company.findUniqueOrThrow({ where: { id: companyId } });
    const seed = await companySeed({ id: companyId, seedJson: company.seedJson, stage: company.stage });
    const expected = await proposeOnRaise(SLUG, companyId, { title, body, kind: "problem", fromDept: "", visibility: "everyone" });
    const payload = raised[0].payload as { routeId: string | null; assigneeRoleHolderId: string | null };
    expect(payload.routeId).toBe(expected.routeId);
    expect(payload.assigneeRoleHolderId).toBe(seed.routes.find((r) => r.id === expected.routeId)?.ownerSeatId ?? null);

    // 6. Teams switched off: the same person's notice is a mail row.
    await db.integration.update({ where: { companyId_system: { companyId, system: "teams" } }, data: { on: false } });
    await raise("tmsz-r2", at9(20), holderSeatId);
    await dispatchOnce(at9(20));
    const rows = await db.outboxMessage.findMany({ where: { companyId, recipientUserId: holderId, key: { startsWith: "notify:tmsz-r2" } } });
    expect(rows).toHaveLength(1);
    expect(rows[0]).toMatchObject({ channel: "mail", template: "raised" });
    expect(rows[0].address).toMatch(/@tmsz-co\.example$/);
  }, 60_000);
});
