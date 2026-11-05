// TMS-E1 (D2, D13, D17): raising a case from Teams through the message extension, against a real Postgres
// and the fake Bot Framework, through the route's POST.
import { afterAll, beforeAll, beforeEach, describe, expect, it } from "vitest";
import { POST } from "@/app/api/[company]/teams/messages/route";
import { templateWrites } from "@/features/demo/content";
import { toSeedJson } from "@/features/demo/parse";
import { bindDemoCompany } from "@/lib/db/demo-identity";
import { getDb } from "@/lib/db/client";
import { writeStructure } from "@/lib/db/structure-writes";
import { resetBotKeyCache } from "@/server/teams/auth";
import { resetAppToken } from "@/server/teams/connector";
import { startFakeBotFramework, type FakeBotFramework } from "../fake-botframework/fake-botframework";

const db = getDb();
const SLUG = "tmsraise-co";
const TENANT = "11111111-2222-3333-4444-555555555556";
const PERSON_AAD = "aad-raiser";
const STRANGER_AAD = "aad-stranger";
let fake: FakeBotFramework;
let companyId = "";
let personId = "";
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

const invoke = (aad: string, name: string, value: unknown) => ({
  type: "invoke",
  name,
  id: `inv-${++n}`,
  serviceUrl: fake.serviceUrl,
  from: { id: `29:${aad}`, aadObjectId: aad },
  recipient: { id: "28:bot" },
  conversation: { id: `conv-${aad}`, conversationType: "groupChat", tenantId: TENANT },
  value,
});
const form = (data: Record<string, unknown>) => ({ commandId: "raise", commandContext: "compose", data: { kind: "problem", visibility: "everyone", ...data } });
const raised = () => db.caseEvent.findMany({ where: { companyId, type: "case.raised", source: "teams" } });
const messageTask = (title: string) => ({ task: { type: "message", value: `Raised: ${title}` } });

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
      slug: SLUG, name: "Tms Raise Co", stage: "sandbox", entraTenantId: TENANT,
      seedJson: toSeedJson(writes.seedJson) as object,
      users: { create: [person("B. Hartmann", "manager"), person("J. Schmidt", "member")] },
    },
  });
  companyId = c.id;
  await writeStructure(c.id, writes, "test");
  await bindDemoCompany(c.id);
  await db.integration.create({ data: { companyId, system: "teams", on: true, settings: {} } });
  const member = await db.user.findFirstOrThrow({ where: { companyId, role: "member" } });
  personId = member.id;
  await db.user.update({ where: { id: personId, companyId }, data: { entraOid: PERSON_AAD } });
  await db.teamsConversation.create({
    data: { companyId, userId: personId, aadObjectId: PERSON_AAD, tenantId: TENANT, conversationId: "chat-raiser", serviceUrl: fake.serviceUrl },
  });
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

type TaskBody = { task: { type: string; value: { card: { content: { body: { id?: string; value?: string }[] } } } } };

describe("TMS raise from Teams", () => {
  it("fetchTask answers the raise form, prefilled from the message in the message context", async () => {
    const res = await post(
      invoke(PERSON_AAD, "composeExtension/fetchTask", {
        commandId: "raise",
        commandContext: "message",
        messagePayload: { body: { contentType: "html", content: "<p>Coolant leak on line 3</p><p>since the early shift</p>" } },
      }),
    );
    expect(res.status).toBe(200);
    const body = (await res.json()) as TaskBody;
    expect(body.task.type).toBe("continue");
    const inputs = body.task.value.card.content.body;
    expect(inputs.find((i) => i.id === "title")?.value).toBe("Coolant leak on line 3");
    expect(inputs.find((i) => i.id === "body")?.value).toContain("since the early shift");

    const bare = (await (await post(invoke(PERSON_AAD, "composeExtension/fetchTask", { commandId: "raise", commandContext: "compose" }))).json()) as TaskBody;
    expect(bare.task.value.card.content.body.find((i) => i.id === "title")?.value).toBe("");
    expect(await raised()).toHaveLength(0);
  });

  it("submitAction raises one teams case as the person, answers with a message task and confirms in the chat", async () => {
    const act = invoke(PERSON_AAD, "composeExtension/submitAction", form({ title: "Coolant leak on line 3", body: "Dripping since the early shift, quality problem." }));
    const res = await post(act);
    expect(res.status).toBe(200);
    expect(await res.json()).toEqual(messageTask("Coolant leak on line 3"));

    const rows = await raised();
    expect(rows).toHaveLength(1);
    expect(rows[0]).toMatchObject({ actorUserId: personId, source: "teams", idemKey: `teams:${act.id}` });
    const payload = rows[0].payload as { title: string; proposal?: { routeId: string | null; source: string }; routeId: string | null; visibility: string };
    expect(payload).toMatchObject({ title: "Coolant leak on line 3", visibility: "everyone" });
    // Routed like an app raise: the proposal is stored and the route is the proposal's.
    expect(payload.proposal?.source).toBe("keywords");
    expect(payload.routeId).toBe(payload.proposal?.routeId ?? null);

    const sent = fake.activities.filter((a) => a.conversationId === "chat-raiser");
    expect(sent).toHaveLength(1);
    expect(JSON.stringify(sent[0].activity)).toContain("Coolant leak on line 3");
  });

  it("a repeated submit writes nothing new and sends no second card", async () => {
    const act = invoke(PERSON_AAD, "composeExtension/submitAction", form({ title: "Repeated raise" }));
    expect(await (await post(act)).json()).toEqual(messageTask("Repeated raise"));
    const cards = fake.activities.length;
    expect(await (await post(act)).json()).toEqual(messageTask("Repeated raise"));
    expect(await db.caseEvent.count({ where: { companyId, idemKey: `teams:${act.id}` } })).toBe(1);
    expect(fake.activities).toHaveLength(cards);
  });

  it("raises an idea as private when the form says so", async () => {
    await post(invoke(PERSON_AAD, "composeExtension/submitAction", form({ kind: "idea", title: "Private idea", visibility: "private" })));
    const row = (await raised()).find((r) => (r.payload as { title?: string }).title === "Private idea");
    expect(row?.payload).toMatchObject({ kind: "idea", visibility: "private" });
  });

  it("an unknown person raises nothing", async () => {
    const before = (await raised()).length;
    const res = await post(invoke(STRANGER_AAD, "composeExtension/submitAction", form({ title: "Not me" })));
    expect(res.status).toBe(200);
    expect(JSON.stringify(await res.json())).toContain("composeExtension");
    expect(await raised()).toHaveLength(before);
  });

  it("a form without a title raises nothing", async () => {
    const before = (await raised()).length;
    const res = await post(invoke(PERSON_AAD, "composeExtension/submitAction", form({ title: "  " })));
    expect(((await res.json()) as { task: { type: string } }).task.type).toBe("message");
    expect(await raised()).toHaveLength(before);
  });
});
