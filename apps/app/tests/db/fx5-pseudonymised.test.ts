// FX5 against Postgres: a pseudonymised person stays gone, in what a browser gets, against a directory push and
// in what is left behind. PILOT_CHECK I2, I3, I4.
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import type { DirectoryEntry } from "@nextup/contracts/public";
import { SCIM_LINK_ISSUER } from "@/features/identity";
import { toSeedJson } from "@/features/demo/parse";
import { SEED } from "@/features/demo/seed";
import { getDb } from "@/lib/db/client";
import { applyDirectoryDelta } from "@/lib/db/directory";
import { appendEventRow, loadLog } from "@/lib/db/events";
import { rebuildProjections } from "@/lib/db/projections/case-view";
import { pseudonymiseUser } from "@/lib/db/pseudonymise";
import { runRetention } from "@/lib/db/retention";
import { createToken } from "@/lib/db/tokens";
import { loadCaseFor, loadLogFor } from "@/lib/db/viewer-log";

const db = getDb();
const NAME = "Greta Gone";
const ids = { company: "", manager: "", gone: "", unit: "" };
const SUBJECT = "scim-subject-1";
const OID = "aaaaaaaa-0000-4000-8000-000000000001";
const NUMBER = "P-4711";

const entry = (o: Partial<DirectoryEntry> & { externalId: string }): DirectoryEntry => ({
  displayName: NAME, email: "greta@fx5.example", department: "Production", jobTitle: null, managerExternalId: null, groupExternalIds: [], employeeId: null, active: true, ...o,
});
const page = (e: DirectoryEntry) => ({ entries: [e], groups: [], removedExternalIds: [], nextCursor: null });
const gone = () => db.user.findFirstOrThrow({ where: { id: ids.gone, companyId: ids.company }, select: { name: true, email: true, active: true, entraOid: true, employeeId: true } });

beforeAll(async () => {
  await db.company.deleteMany({});
  ids.company = (await db.company.create({ data: { slug: "fx5-co", name: "FX5", stage: "pilot", seedJson: toSeedJson(SEED) as object } })).id;
  ids.unit = (await db.orgUnit.create({ data: { companyId: ids.company, key: "PRD", name: "Production" } })).id;
  ids.manager = (await db.user.create({ data: { companyId: ids.company, name: "Mia Manager", email: "mia@fx5.example", role: "manager" } })).id;
  ids.gone = (await db.user.create({ data: { companyId: ids.company, name: NAME, email: "greta@fx5.example", role: "leader", dept: "PRD", entraOid: OID, employeeId: NUMBER, active: false } })).id;
  await db.externalIdentity.create({ data: { companyId: ids.company, userId: ids.gone, provider: "scim", issuer: SCIM_LINK_ISSUER, subject: SUBJECT } });
  await db.teamsConversation.create({ data: { companyId: ids.company, userId: ids.gone, aadObjectId: "a", tenantId: "t", conversationId: "c", serviceUrl: "https://x.example" } });
  await db.outboxMessage.create({ data: { companyId: ids.company, channel: "mail", key: "m1", recipientUserId: ids.gone, address: "greta@fx5.example", template: "raised", locale: "de", subject: `Hallo ${NAME}`, text: `Hallo ${NAME}`, status: "sent" } });
  const add = (id: string, type: string, target: string, payload: Record<string, unknown>, actorUserId: string | null) =>
    appendEventRow(ids.company, { id, day: 0, type: type as never, actor: actorUserId === ids.gone ? NAME : "Mia Manager", targetId: target, payload: payload as never }, { actorUserId });
  await add("e1", "case.raised", "c1", { title: "t", body: "b", routeId: null, assignee: "Desk", fromDept: "PRD", kind: "idea", visibility: "everyone" }, ids.gone);
  await add("e2", "case.commented", "c1", { text: "hi" }, ids.gone);
  await add("e3", "case.decided", "c1", { answer: "yes", reason: "r", projectId: "p1", lead: NAME, leadUserId: ids.gone }, ids.manager);
  expect(await pseudonymiseUser(ids.company, ids.gone)).not.toBeNull();
  await rebuildProjections(ids.company);
});

afterAll(async () => {
  await db.company.deleteMany({});
  await db.$disconnect();
});

describe("FX5 what a browser gets", () => {
  it("the shipped log has the pseudonym, not the name", async () => {
    const { log } = await loadLogFor(ids.company, { userId: ids.manager, role: "manager" });
    const text = JSON.stringify(log.events);
    expect(text).toContain("c1");
    expect(text).not.toContain(NAME);
  });

  it("so does one case's own load", async () => {
    const loaded = await loadCaseFor(ids.company, { userId: ids.manager, role: "manager" }, "c1");
    expect(loaded).not.toBeNull();
    expect(JSON.stringify(loaded?.events)).not.toContain(NAME);
  });

  it("so does the whole log the server works from, which API v1 reads", async () => {
    expect(JSON.stringify((await loadLog(ids.company)).events)).not.toContain(NAME);
  });

  it("so does the events endpoint, which still sends no actor's user id", async () => {
    const raw = await createToken(ids.company, "n8n", ["events:read"]);
    const { GET } = await import("@/app/api/[company]/events/route");
    const res = await GET(new Request("http://localhost/api/fx5-co/events", { headers: { authorization: `Bearer ${raw}` } }), { params: Promise.resolve({ company: "fx5-co" }) });
    const text = await res!.text();
    expect(text).not.toContain(NAME);
    const events = (JSON.parse(text) as { events: { id: string; actor: string; actorUserId: string | null }[] }).events;
    const comment = events.find((e) => e.id === "e2");
    expect(comment?.actor).not.toBe(NAME);
    expect(comment?.actorUserId).toBeNull();
  });

  it("the stored events keep what they were written with", async () => {
    const row = await db.caseEvent.findFirstOrThrow({ where: { companyId: ids.company, id: "e2" } });
    expect(row.actor).toBe(NAME);
  });
});

describe("FX5 a directory push", () => {
  it("over SCIM brings nobody back", async () => {
    const before = await gone();
    const counts = await applyDirectoryDelta(ids.company, "scim", page(entry({ externalId: SUBJECT })));
    expect(counts).toMatchObject({ added: 0, updated: 0 });
    expect(await gone()).toEqual(before);
    expect(before.active).toBe(false);
  });

  it("from Graph or SuccessFactors makes no new person of them, though the ids were cleared", async () => {
    expect((await gone()).entraOid).toBeNull();
    const users = () => db.user.count({ where: { companyId: ids.company } });
    const before = await users();
    await applyDirectoryDelta(ids.company, "graph", page(entry({ externalId: OID })));
    await applyDirectoryDelta(ids.company, "successfactors", page(entry({ externalId: NUMBER })));
    expect(await users()).toBe(before);
  });

  it("under a new SCIM subject with their old email makes no new person either", async () => {
    const users = () => db.user.count({ where: { companyId: ids.company } });
    const before = await users();
    await applyDirectoryDelta(ids.company, "scim", page(entry({ externalId: "scim-subject-new" })));
    expect(await users()).toBe(before);
  });

  it("holds nobody back for a manager who was pseudonymised", async () => {
    const counts = await applyDirectoryDelta(ids.company, "graph", page(entry({ externalId: "cccccccc-0000-4000-8000-000000000003", displayName: "Colleague", email: "colleague@fx5.example", managerExternalId: OID })));
    expect(counts.added).toBe(1);
    expect(counts.held.unknownManager).toBe(0);
  });

  it("still handles someone else in the same company", async () => {
    const counts = await applyDirectoryDelta(ids.company, "graph", page(entry({ externalId: "bbbbbbbb-0000-4000-8000-000000000002", displayName: "New Person", email: "new@fx5.example" })));
    expect(counts.added).toBe(1);
  });

  it("keeps no readable ids behind", async () => {
    const rows = await db.externalIdentity.findMany({ where: { companyId: ids.company, userId: ids.gone, provider: "former" } });
    expect(rows).toHaveLength(3);
    const text = JSON.stringify(rows);
    for (const id of [OID, NUMBER, "greta@fx5.example"]) expect(text).not.toContain(id);
  });
});

describe("FX5 what is left behind", () => {
  it("pseudonymising removes their Teams link and the mails to them", async () => {
    expect(await db.teamsConversation.count({ where: { companyId: ids.company, userId: ids.gone } })).toBe(0);
    expect(await db.outboxMessage.count({ where: { companyId: ids.company, recipientUserId: ids.gone } })).toBe(0);
  });

  it("retention removes old finished notices and leaves new and unsent ones", async () => {
    const now = new Date();
    const old = new Date(now.getTime() - 200 * 86_400_000);
    const message = (key: string, status: string, createdAt: Date) => ({ companyId: ids.company, channel: "mail", key, address: "x@fx5.example", template: "raised", locale: "de", subject: "s", text: "t", status, createdAt });
    await db.outboxMessage.createMany({ data: [message("old-sent", "sent", old), message("old-skipped", "skipped", old), message("old-pending", "pending", old), message("new-sent", "sent", now)] });
    const totals = await runRetention(ids.company, now);
    expect(totals.outbox).toBe(2);
    const left = (await db.outboxMessage.findMany({ where: { companyId: ids.company }, select: { key: true } })).map((m) => m.key).sort();
    expect(left).toEqual(["new-sent", "old-pending"]);
  });

  it("retention removes the Teams link of someone who has left", async () => {
    const left = await db.user.create({ data: { companyId: ids.company, name: "Left", email: "left@fx5.example", role: "member", active: false } });
    const here = await db.user.create({ data: { companyId: ids.company, name: "Here", email: "here@fx5.example", role: "member" } });
    const link = (userId: string, c: string) => ({ companyId: ids.company, userId, aadObjectId: c, tenantId: "t", conversationId: c, serviceUrl: "https://x.example" });
    await db.teamsConversation.createMany({ data: [link(left.id, "c-left"), link(here.id, "c-here")] });
    const totals = await runRetention(ids.company);
    expect(totals.teamsLinks).toBe(1);
    expect((await db.teamsConversation.findMany({ where: { companyId: ids.company }, select: { userId: true } })).map((c) => c.userId)).toEqual([here.id]);
  });
});
