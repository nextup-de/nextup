// TMS-D1 (D7, D12, D14, D17): the bot endpoint against a real Postgres and the fake Bot Framework.
import { afterAll, beforeAll, beforeEach, describe, expect, it } from "vitest";
import { POST } from "@/app/api/[company]/teams/messages/route";
import { reduce } from "@/features/cases/reducer";
import { dateOfWorkday, isWorkday, workdayOf } from "@/features/clock/calendar";
import { seedFor } from "@/features/demo";
import { templateWrites } from "@/features/demo/content";
import { toSeedJson } from "@/features/demo/parse";
import { companySeed } from "@/lib/db/companies";
import { bindDemoCompany } from "@/lib/db/demo-identity";
import { invalidateFlags } from "@/features/flags";
import { loadCalendar } from "@/lib/db/calendar";
import { appendEventRow, loadLog } from "@/lib/db/events";
import { passFromCard } from "@/server/teams/card-actions";
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
    await post(SLUG, submit(OWNER_AAD, { kind: "answer", caseId: "tb-no", cardId: "c1", answer: "no", category: "no-budget", text: "Too costly this quarter, the budget for tools is already spent." }), fake.mintToken());
    const rows = await events("case.decided", "tb-no");
    expect(rows).toHaveLength(1);
    expect(rows[0].payload).toMatchObject({ answer: "no", category: "no-budget", reason: "Too costly this quarter, the budget for tools is already spent." });
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
    await post(SLUG, submit(OWNER_AAD, { kind: "answer", caseId: "tb-draft-no", cardId: "c1", answer: "no", category: "no-budget", text: "Too costly this quarter, the budget for tools is already spent." }), fake.mintToken());
    const rows = await events("case.decided", "tb-draft-no");
    expect(rows).toHaveLength(1);
    expect(rows[0].payload).toMatchObject({ answer: "no", category: "no-budget", reason: "Too costly this quarter, the budget for tools is already spent." });
    expect(rows[0].payload).not.toHaveProperty("draft");
  });
});

describe("NOR Teams no", () => {
  const REASON = "The budget for this year is already spent on the new line.";
  const no = (caseId: string, extra: Record<string, unknown>, aad = OWNER_AAD) =>
    post(SLUG, submit(aad, { kind: "answer", caseId, cardId: "c1", answer: "no", ...extra }), fake.mintToken());
  /** The company's date `ahead` working days from today, and today's working-day number. */
  async function when(ahead: number) {
    const cal = await loadCalendar(companyId);
    const today = workdayOf(new Date(), cal);
    return { cal, today, iso: dateOfWorkday(today + ahead, cal) };
  }
  const written = (id: string) => db.caseEvent.count({ where: { companyId, targetId: id, type: "case.decided" } });

  it("a no with a category and a reason of 40 characters or more writes the NOR payload, with what would make it a yes and the revisit day as a working-day number", async () => {
    expect(REASON.length).toBeGreaterThanOrEqual(40);
    await raiseCase("tn-no");
    const { today, iso } = await when(5);
    await no("tn-no", { category: "not-now", text: REASON, changeIf: "A quote under 5000 euro", revisitDay: iso });
    const rows = await events("case.decided", "tn-no");
    expect(rows).toHaveLength(1);
    expect(rows[0].payload).toEqual({ answer: "no", category: "not-now", reason: REASON, changeIf: "A quote under 5000 euro", revisitDay: today + 5 });
    expect(lastCardText()).toContain("You said no");
    // Without a date or what would make it a yes, and for a category that needs no date, only what was given is written.
    await raiseCase("tn-plain");
    await no("tn-plain", { category: "no-fit", text: REASON });
    expect((await events("case.decided", "tn-plain"))[0].payload).toEqual({ answer: "no", category: "no-fit", reason: REASON });
    await raiseCase("tn-budget");
    await no("tn-budget", { category: "no-budget", text: REASON, revisitDay: (await when(3)).iso });
    expect((await events("case.decided", "tn-budget"))[0].payload).toMatchObject({ category: "no-budget", revisitDay: (await when(3)).today + 3 });
  });

  it("a short reason, a missing category and a not-now without a date are refused on the card, and nothing is written", async () => {
    await raiseCase("tn-refuse");
    const { iso } = await when(5);
    const refused: [string, Record<string, unknown>, string][] = [
      ["a reason one character short", { category: "no-fit", text: REASON.slice(0, 39) }, "at least 40 characters"],
      ["no reason", { category: "no-fit" }, "at least 40 characters"],
      ["no category", { text: REASON }, "Pick why you say no"],
      ["not-now without a date", { category: "not-now", text: REASON }, "needs the date it should come back"],
      ["a date on a category that cannot come back", { category: "risk", text: REASON, revisitDay: iso }, "Only Not now and No budget"],
    ];
    for (const [name, extra, why] of refused) {
      fake.activities.length = 0;
      expect((await no("tn-refuse", extra)).status, name).toBe(200);
      expect(await written("tn-refuse"), name).toBe(0);
      expect(lastCardText(), name).toContain("did not go through");
      expect(lastCardText(), name).toContain(why);
    }
  });

  it("refuses a revisit date that is no working day after today within 250 working days, and one that is no date at all", async () => {
    await raiseCase("tn-dates");
    const cal = await loadCalendar(companyId);
    const today = workdayOf(new Date(), cal);
    // The first Saturday after today: a day of the calendar, but no working day.
    let saturday = new Date(`${dateOfWorkday(today + 3, cal)}T12:00:00Z`);
    while (isWorkday(saturday.toISOString().slice(0, 10), cal) || saturday.getUTCDay() !== 6) saturday = new Date(saturday.getTime() + 864e5);
    const bad: [string, string][] = [
      ["a Saturday", saturday.toISOString().slice(0, 10)],
      ["a working day before today", dateOfWorkday(today - 1, cal)],
      ["too far ahead", dateOfWorkday(today + 251, cal)],
      ["not a date", "next spring"],
    ];
    for (const [name, revisitDay] of bad) {
      fake.activities.length = 0;
      await no("tn-dates", { category: "not-now", text: REASON, revisitDay });
      expect(await written("tn-dates"), name).toBe(0);
      expect(lastCardText(), name).toContain("did not go through");
    }
    // The last day that counts: 250 working days ahead.
    await no("tn-dates", { category: "not-now", text: REASON, revisitDay: dateOfWorkday(today + 250, cal) });
    expect((await events("case.decided", "tn-dates"))[0].payload).toMatchObject({ revisitDay: today + 250 });
  });

  it("names the latest decision of the current cycle: a decided case refuses the card, a reopened one lets it decide again", async () => {
    await raiseCase("tn-reopen");
    const { iso, today } = await when(4);
    await no("tn-reopen", { category: "not-now", text: REASON, revisitDay: iso });
    expect(await written("tn-reopen")).toBe(1);
    fake.activities.length = 0;
    await no("tn-reopen", { category: "no-fit", text: REASON });
    expect(await written("tn-reopen")).toBe(1);
    expect(lastCardText()).toContain("already answered by");

    // The clock brings it back on the owner's desk (case.reopened, D12): the first no is no longer the case's decision.
    const row = await db.company.findUniqueOrThrow({ where: { id: companyId } });
    const seed = await companySeed({ id: companyId, seedJson: row.seedJson, stage: "sandbox" });
    const seat = seed.routes.find((r) => r.ownerSeatId && seed.seats.find((x) => x.id === r.ownerSeatId)?.userId === ownerUserId)!.ownerSeatId;
    const r = await appendEventRow(companyId, { id: "tn-reopen-back", day: 0, type: "case.reopened", actor: "system:clock", targetId: "tn-reopen", payload: { why: "revisit", dueDay: today + 10, toRoleHolderId: seat } } as never, { source: "clock" });
    expect(r.ok).toBe(true);
    fake.activities.length = 0;
    await no("tn-reopen", { category: "no-fit", text: REASON });
    const rows = await events("case.decided", "tn-reopen");
    expect(rows).toHaveLength(2);
    expect(rows[1].payload).toEqual({ answer: "no", category: "no-fit", reason: REASON });
    expect(lastCardText()).toContain("You said no");
  });

  it("a hand-over needs a why of 8 characters and carries the route of the seat it goes to", async () => {
    await raiseCase("tn-hand-short");
    await post(SLUG, submit(OWNER_AAD, { kind: "handover", caseId: "tn-hand-short", cardId: "c1", toSeatId: handTo, why: "Too few" }), fake.mintToken());
    expect(await events("case.handed", "tn-hand-short")).toHaveLength(0);
    expect(lastCardText()).toContain("at least 8 characters");

    await raiseCase("tn-hand-route");
    await post(SLUG, submit(OWNER_AAD, { kind: "handover", caseId: "tn-hand-route", cardId: "c1", toSeatId: handTo, why: "This is for the other desk" }), fake.mintToken());
    const rows = await events("case.handed", "tn-hand-route");
    expect(rows).toHaveLength(1);
    const seed = await seedFor(SLUG);
    const route = seed.routes.find((x) => x.ownerSeatId === handTo) ?? seed.routes.find((x) => x.deputySeatId === handTo);
    expect(rows[0].payload).toMatchObject({ toRoleHolderId: handTo, why: "This is for the other desk" });
    expect((rows[0].payload as Record<string, unknown>).routeId).toBe(route?.id);
    expect(rows[0].payload).not.toHaveProperty("keepsQuestion");
  });

  it("passFromCard stamps keepsQuestion on an asked case, the answer-date floor and the route, and stops a non-manager at the pass limit", async () => {
    await raiseCase("tn-asked");
    await post(SLUG, submit(OWNER_AAD, { kind: "answer", caseId: "tn-asked", cardId: "c1", answer: "ask", text: "Which line is it?" }), fake.mintToken());
    const seed = await seedFor(SLUG);
    const state = reduce(seed, await loadLog(companyId));
    const kase = state.cases.find((c) => c.id === "tn-asked")!;
    expect(kase.status).toBe("asked");
    const submitted = { toSeatId: handTo, why: "The question belongs to the other desk" };
    const asked = passFromCard(kase, state, seed, "leader", submitted);
    expect(asked).toMatchObject({ ok: true, payload: { toRoleHolderId: handTo, keepsQuestion: true } });
    // The new desk gets at least two working days: a nearer answer date is moved out; a farther one stays.
    const near = passFromCard({ ...kase, status: "open", dueDay: state.day + 1 }, state, seed, "leader", submitted);
    expect(near).toMatchObject({ ok: true, payload: { dueDay: state.day + 2 } });
    const far = passFromCard({ ...kase, status: "open", dueDay: state.day + 5 }, state, seed, "leader", submitted);
    expect(far.ok && far.payload).not.toHaveProperty("dueDay");
    // Two passes already: a leader stops (and is pointed to NextUp), a manager does not stop.
    expect(passFromCard({ ...kase, status: "open", passes: 2 }, state, seed, "leader", submitted)).toMatchObject({ ok: false, error: "teams.errorPassLimit", limit: true });
    expect(passFromCard({ ...kase, status: "open", passes: 2 }, state, seed, "manager", submitted).ok).toBe(true);
    // A why under 8 characters never goes through, whoever sends it.
    expect(passFromCard({ ...kase, status: "open" }, state, seed, "manager", { toSeatId: handTo, why: "Too few" })).toMatchObject({ ok: false, error: "teams.errorWhyShort" });
  });
});
