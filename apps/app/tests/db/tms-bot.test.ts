// TMS-D1 (D7, D12, D14, D17): the bot endpoint against a real Postgres and the fake Bot Framework.
import { afterAll, beforeAll, beforeEach, describe, expect, it } from "vitest";
import { POST } from "@/app/api/[company]/teams/messages/route";
import { templateWrites } from "@/features/demo/content";
import { toSeedJson } from "@/features/demo/parse";
import { companySeed } from "@/lib/db/companies";
import { bindDemoCompany } from "@/lib/db/demo-identity";
import { invalidateFlags } from "@/features/flags";
import { appendEventRow } from "@/lib/db/events";
import { getDb } from "@/lib/db/client";
import { writeStructure } from "@/lib/db/structure-writes";
import { resetBotKeyCache } from "@/server/teams/auth";
import { resetAppToken } from "@/server/teams/connector";
import { startFakeBotFramework, type FakeBotFramework } from "../fake-botframework/fake-botframework";

const db = getDb();
const SLUG = "tmsbot-co";
const TENANT = "11111111-2222-3333-4444-555555555555";
const OWNER_AAD = "aad-owner";
const OTHER_AAD = "aad-other";
let fake: FakeBotFramework;
let companyId = "";
let ownerUserId = "";
let otherUserId = "";
let handTo = "";
let n = 0;

const post = (slug: string, activity: unknown, token: string | null) =>
  POST(
    new Request(`http://x/api/${slug}/teams/messages`, {
      method: "POST",
      headers: { "content-type": "application/json", ...(token ? { authorization: `Bearer ${token}` } : {}) },
      body: JSON.stringify(activity),
    }),
    { params: Promise.resolve({ company: slug }) },
  );

const base = (aad: string, extra: Record<string, unknown> = {}) => ({
  id: `act-${++n}`,
  serviceUrl: fake.serviceUrl,
  from: { id: `29:${aad}`, aadObjectId: aad },
  recipient: { id: "28:bot" },
  conversation: { id: `conv-${aad}`, conversationType: "personal", tenantId: TENANT },
  ...extra,
});
const submit = (aad: string, value: Record<string, unknown>, id?: string) =>
  base(aad, { type: "message", value, ...(id ? { id } : {}) });

async function raiseCase(id: string): Promise<void> {
  const row = await db.company.findUniqueOrThrow({ where: { id: companyId } });
  const seed = await companySeed({ id: companyId, seedJson: row.seedJson, stage: "sandbox" });
  const route = seed.routes.find((r) => r.ownerSeatId && seed.seats.find((s) => s.id === r.ownerSeatId)?.userId === ownerUserId)!;
  await appendEventRow(
    companyId,
    { id: `${id}-raised`, day: 0, type: "case.raised", actor: "J. Schmidt", targetId: id, payload: { title: `Case ${id}`, routeId: route.id, assigneeRoleHolderId: route.ownerSeatId } } as never,
  );
}

const events = (type: string, targetId: string) => db.caseEvent.findMany({ where: { companyId, type, targetId, source: "teams" } });
const lastCardText = () => JSON.stringify(fake.activities.at(-1)?.activity ?? "");

beforeAll(async () => {
  fake = await startFakeBotFramework();
  process.env.TEAMS_APP_ID = fake.appId;
  process.env.TEAMS_APP_PASSWORD = fake.password;
  process.env.TEAMS_TENANT_ID = TENANT;
  process.env.TEAMS_OPENID_URL = fake.openIdUrl;
  process.env.TEAMS_TOKEN_URL = fake.tokenUrl;

  await db.company.deleteMany({ where: { slug: SLUG } });
  const writes = templateWrites("demo", () => crypto.randomUUID());
  const person = (name: string, role: string) => ({ name, email: `${name.replace(/\W+/g, "").toLowerCase()}@${SLUG}.example`, role, dept: "", ini: "XX", handle: null });
  const c = await db.company.create({
    data: {
      openedAt: new Date(),
      slug: SLUG, name: "Tms Bot Co", stage: "sandbox", entraTenantId: TENANT,
      seedJson: toSeedJson(writes.seedJson) as object,
      users: { create: [person("B. Hartmann", "manager"), person("T. Vogel", "leader"), person("J. Schmidt", "member")] },
    },
  });
  companyId = c.id;
  await writeStructure(c.id, writes, "test");
  await bindDemoCompany(c.id);
  await db.integration.create({ data: { companyId, system: "teams", on: true, settings: {} } });

  const seed = await companySeed({ id: c.id, seedJson: c.seedJson, stage: "sandbox" });
  const route = seed.routes.find((r) => r.ownerSeatId && seed.seats.find((s) => s.id === r.ownerSeatId)?.userId)!;
  const ownerSeat = seed.seats.find((s) => s.id === route.ownerSeatId)!;
  ownerUserId = ownerSeat.userId!;
  const other = await db.user.findFirstOrThrow({ where: { companyId, id: { not: ownerUserId }, role: { not: "manager" } } });
  otherUserId = other.id;
  handTo = seed.seats.find((s) => s.roleId !== ownerSeat.roleId)!.id;
  await db.user.update({ where: { id: ownerUserId, companyId }, data: { entraOid: OWNER_AAD } });
  await db.user.update({ where: { id: otherUserId, companyId }, data: { entraOid: OTHER_AAD } });
});

beforeEach(() => {
  resetBotKeyCache();
  resetAppToken();
  fake.activities.length = 0;
});

afterAll(async () => {
  await db.company.deleteMany({ where: { slug: SLUG } });
  await db.$disconnect();
  await fake.close();
});

describe("TMS bot endpoint", () => {
  it("refuses a bad token with 401 and another tenant with 403, and stores nothing", async () => {
    const msg = submit(OWNER_AAD, { kind: "answer", caseId: "x", cardId: "y", answer: "yes" });
    expect((await post(SLUG, msg, null)).status).toBe(401);
    expect((await post(SLUG, msg, "garbage")).status).toBe(401);
    expect((await post(SLUG, msg, fake.mintToken({ serviceurl: "https://evil.example/" }))).status).toBe(401);
    const foreign = base(OWNER_AAD, { type: "conversationUpdate", membersAdded: [{ id: "28:bot" }] });
    foreign.conversation.tenantId = "99999999-0000-0000-0000-000000000000";
    expect((await post(SLUG, foreign, fake.mintToken())).status).toBe(403);
    expect(await db.teamsConversation.count({ where: { companyId } })).toBe(0);
    expect(fake.activities).toHaveLength(0);
  });

  it("saves the person's conversation when the bot is added, and greets them", async () => {
    const add = base(OWNER_AAD, { type: "conversationUpdate", membersAdded: [{ id: "28:bot" }] });
    expect((await post(SLUG, add, fake.mintToken())).status).toBe(200);
    const row = await db.teamsConversation.findFirstOrThrow({ where: { companyId } });
    expect(row).toMatchObject({ userId: ownerUserId, aadObjectId: OWNER_AAD, tenantId: TENANT, conversationId: `conv-${OWNER_AAD}` });
    expect(fake.activities.at(-1)?.conversationId).toBe(`conv-${OWNER_AAD}`);
    // The tenant compares without case, and a second add keeps one row.
    const again = base(OWNER_AAD, { type: "conversationUpdate", membersAdded: [{ id: "28:bot" }] });
    again.conversation.tenantId = TENANT.toUpperCase();
    expect((await post(SLUG, again, fake.mintToken())).status).toBe(200);
    expect(await db.teamsConversation.count({ where: { companyId } })).toBe(1);
  });

  it("yes appends case.decided yes, once even when Teams repeats the activity", async () => {
    await raiseCase("tb-yes");
    const act = submit(OWNER_AAD, { kind: "answer", caseId: "tb-yes", cardId: "c1", answer: "yes" }, "repeat-1");
    expect((await post(SLUG, act, fake.mintToken())).status).toBe(200);
    expect((await post(SLUG, act, fake.mintToken())).status).toBe(200);
    const rows = await events("case.decided", "tb-yes");
    expect(rows).toHaveLength(1);
    expect(rows[0]).toMatchObject({ actorUserId: ownerUserId, idemKey: "teams:repeat-1" });
    expect(rows[0].payload).toMatchObject({ answer: "yes" });
    expect(fake.activities).toHaveLength(1);
  });

  it("no with text appends case.decided no with the reason", async () => {
    await raiseCase("tb-no");
    await post(SLUG, submit(OWNER_AAD, { kind: "answer", caseId: "tb-no", cardId: "c1", answer: "no", text: "Too costly" }), fake.mintToken());
    const rows = await events("case.decided", "tb-no");
    expect(rows).toHaveLength(1);
    expect(rows[0].payload).toMatchObject({ answer: "no", reason: "Too costly" });
  });

  it("ask appends case.asked", async () => {
    await raiseCase("tb-ask");
    await post(SLUG, submit(OWNER_AAD, { kind: "answer", caseId: "tb-ask", cardId: "c1", answer: "ask", text: "Which line?" }), fake.mintToken());
    const rows = await events("case.asked", "tb-ask");
    expect(rows).toHaveLength(1);
    expect(rows[0].payload).toMatchObject({ text: "Which line?" });
  });

  it("hand-over appends case.handed to the chosen seat, once", async () => {
    await raiseCase("tb-hand");
    const act = submit(OWNER_AAD, { kind: "handover", caseId: "tb-hand", cardId: "c1", toSeatId: handTo, why: "Not mine" }, "repeat-2");
    await post(SLUG, act, fake.mintToken());
    await post(SLUG, act, fake.mintToken());
    const rows = await events("case.handed", "tb-hand");
    expect(rows).toHaveLength(1);
    expect(rows[0].payload).toMatchObject({ toRoleHolderId: handTo, why: "Not mine" });
  });

  it("refuses a person who is not on the desk, with a reply", async () => {
    await raiseCase("tb-off");
    await post(SLUG, submit(OTHER_AAD, { kind: "answer", caseId: "tb-off", cardId: "c1", answer: "yes" }), fake.mintToken());
    expect(await events("case.decided", "tb-off")).toHaveLength(0);
    expect(fake.activities).toHaveLength(1);
    expect(lastCardText()).toContain("did not go through");
  });

  it("gives an unknown person the not-set-up card and stores nothing", async () => {
    await raiseCase("tb-unknown");
    const res = await post(SLUG, submit("aad-stranger", { kind: "answer", caseId: "tb-unknown", cardId: "c1", answer: "yes" }), fake.mintToken());
    expect(res.status).toBe(200);
    expect(await events("case.decided", "tb-unknown")).toHaveLength(0);
    expect(lastCardText()).toContain("Not signed in to NextUp");
    expect(await db.teamsConversation.count({ where: { companyId, aadObjectId: "aad-stranger" } })).toBe(0);
  });

  it("with Teams switched off answers 200 with a card and stores nothing", async () => {
    await raiseCase("tb-switch");
    await db.integration.update({ where: { companyId_system: { companyId, system: "teams" } }, data: { on: false } });
    await db.teamsConversation.deleteMany({ where: { companyId } });
    try {
      const res = await post(SLUG, submit(OWNER_AAD, { kind: "answer", caseId: "tb-switch", cardId: "c1", answer: "yes" }), fake.mintToken());
      expect(res.status).toBe(200);
      expect(await events("case.decided", "tb-switch")).toHaveLength(0);
      expect(await db.teamsConversation.count({ where: { companyId } })).toBe(0);
      expect(lastCardText()).toContain("switched off");
    } finally {
      await db.integration.update({ where: { companyId_system: { companyId, system: "teams" } }, data: { on: true } });
    }
  });
});

describe("SET Teams yes opens a draft", () => {
  it("with projects on, a yes writes a draft yes: a new project id, the answering person as lead, and the card links to the draft", async () => {
    await raiseCase("tb-draft");
    expect((await post(SLUG, submit(OWNER_AAD, { kind: "answer", caseId: "tb-draft", cardId: "c1", answer: "yes" }), fake.mintToken())).status).toBe(200);
    const rows = await events("case.decided", "tb-draft");
    expect(rows).toHaveLength(1);
    const payload = rows[0].payload as Record<string, unknown>;
    expect(payload).toMatchObject({ answer: "yes", draft: true, leadUserId: ownerUserId, title: "Case tb-draft" });
    expect(payload.projectId).toMatch(/^p_[A-Za-z0-9]+$/);
    expect(rows[0].actorUserId).toBe(ownerUserId);
    const card = lastCardText();
    expect(card).toContain(`/projects/${payload.projectId}`);
    expect(card).not.toContain("/cases/tb-draft");
  });

  it("with projects off it stays a plain yes and the card links to the case", async () => {
    await db.featureFlag.upsert({
      where: { companyId_key: { companyId, key: "projects" } },
      create: { companyId, key: "projects", enabled: false, updatedAt: new Date() },
      update: { enabled: false },
    });
    invalidateFlags(SLUG);
    try {
      await raiseCase("tb-plain");
      expect((await post(SLUG, submit(OWNER_AAD, { kind: "answer", caseId: "tb-plain", cardId: "c1", answer: "yes" }), fake.mintToken())).status).toBe(200);
      const rows = await events("case.decided", "tb-plain");
      expect(rows).toHaveLength(1);
      expect(rows[0].payload).toEqual({ answer: "yes" });
      expect(lastCardText()).toContain("/cases/tb-plain");
    } finally {
      await db.featureFlag.deleteMany({ where: { companyId, key: "projects" } });
      invalidateFlags(SLUG);
    }
  });

  it("a no keeps its behaviour with projects on", async () => {
    await raiseCase("tb-draft-no");
    await post(SLUG, submit(OWNER_AAD, { kind: "answer", caseId: "tb-draft-no", cardId: "c1", answer: "no", text: "Too costly" }), fake.mintToken());
    const rows = await events("case.decided", "tb-draft-no");
    expect(rows).toHaveLength(1);
    expect(rows[0].payload).toMatchObject({ answer: "no", reason: "Too costly" });
    expect(rows[0].payload).not.toHaveProperty("draft");
  });
});
