// MOV-L1: when someone leaves the company, their live projects show no lead and their open steps lose their owner
// (D14 Q10.17, D22 Q6.10). The leaver path writes project.lead.vacated for each project they lead and project.member off
// with unassign where they are member, sponsor, follower or own an open step, as system:directory. The assertions read
// the CaseEvent rows: what the reducer does with them is MOV-A1's.
import type { DirectoryEntry, DirectoryPage } from "@nextup/contracts/public";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import type { CaseEventType, EventPayload } from "@/features/cases/events";
import { templateWrites } from "@/features/demo/content";
import { toSeedJson } from "@/features/demo/parse";
import { getDb } from "@/lib/db/client";
import { applyDirectoryDelta, deactivateUser } from "@/lib/db/directory";
import { appendEventRow } from "@/lib/db/events";
import { writeStructure } from "@/lib/db/structure-writes";

const db = getDb();
const SLUG = "mov-leaver";
const P1 = "p_mov_one";
const P2 = "p_mov_two";
let companyId = "";
const u = { lead: "", member: "", sponsor: "", boss: "" };

// Working days of a sandbox company (Mon to Fri), one per departure.
const T1 = new Date("2026-11-02T10:00:00Z");
const T2 = new Date("2026-11-03T10:00:00Z");
const T3 = new Date("2026-11-04T10:00:00Z");
const T4 = new Date("2026-11-05T10:00:00Z");
const T5 = new Date("2026-11-06T10:00:00Z");

async function add(type: CaseEventType, target: string | null, payload: EventPayload, userId: string | null = u.boss) {
  const r = await appendEventRow(companyId, { id: crypto.randomUUID(), day: 0, type, actor: "x", targetId: target, payload }, { actorUserId: userId, now: T1 });
  expect(r.ok).toBe(true);
}

/** What the directory wrote on a project, as the rows say it. */
const directoryRows = (target: string, type: string) =>
  db.caseEvent.findMany({ where: { companyId, targetId: target, type, source: "directory" }, orderBy: { seq: "asc" } });
const directoryCount = () => db.caseEvent.count({ where: { companyId, source: "directory" } });

const entry = (o: Partial<DirectoryEntry> & { externalId: string }): DirectoryEntry => ({
  displayName: o.externalId, email: o.externalId + "@mov-leaver.example", department: "Engineering", jobTitle: null,
  managerExternalId: null, groupExternalIds: [], active: true, ...o,
});

beforeAll(async () => {
  await db.company.deleteMany({ where: { slug: SLUG } });
  const writes = templateWrites("demo", () => crypto.randomUUID());
  const c = await db.company.create({ data: { slug: SLUG, name: "MOV leaver", stage: "sandbox", seedJson: toSeedJson(writes.seedJson) as object } });
  companyId = c.id;
  await writeStructure(companyId, writes, "test");
  const mk = (n: string, role: string) => db.user.create({
    data: { companyId, name: n, email: n + "@mov-leaver.example", role, dept: "ENG", entraOid: "oid-" + n }, select: { id: true },
  });
  u.lead = (await mk("lead", "leader")).id;
  u.member = (await mk("member", "member")).id;
  u.sponsor = (await mk("sponsor", "leader")).id;
  u.boss = (await mk("boss", "manager")).id;

  // P1: the lead asked by the boss (a draft, so a sponsor can be invited), a sponsor, a member owning an open and a
  // done step, started. P2: led by the member.
  await add("case.raised", "c_mov_one", { kind: "idea", title: "One", body: "text", routeId: "r2", assignee: "Triage desk" }, u.member);
  await add("case.decided", "c_mov_one", { answer: "yes", projectId: P1, lead: "lead", leadUserId: u.lead, title: "Project one", draft: true });
  await add("project.lead.answered", P1, { take: true }, u.lead);
  await add("project.invited", P1, { userId: u.sponsor, role: "sponsor" });
  await add("project.invite.answered", P1, { userId: u.sponsor, take: true }, u.sponsor);
  await add("project.member", P1, { userId: u.member, on: true, name: "member" }, u.lead);
  await add("project.baseline", P1, { metric: "Changeover", unit: "min", value: 42, better: "down", source: "MES" }, u.lead);
  await add("project.started", P1, {}, u.lead);
  await add("project.step.added", P1, { stepId: "s_open", text: "Open step", ownerUserId: u.member, owner: "member" }, u.lead);
  await add("project.step.added", P1, { stepId: "s_done", text: "Done step", ownerUserId: u.member, owner: "member", to: "done" }, u.lead);
  await add("case.raised", "c_mov_two", { kind: "idea", title: "Two", body: "text", routeId: "r2", assignee: "Triage desk" }, u.lead);
  await add("case.decided", "c_mov_two", { answer: "yes", projectId: P2, lead: "member", leadUserId: u.member, title: "Project two" });
});

afterAll(async () => {
  await db.company.deleteMany({ where: { slug: SLUG } });
  await db.$disconnect();
});

describe("MOV leaver", () => {
  it("deactivating the lead writes project.lead.vacated once, on the project they lead only", async () => {
    expect(await deactivateUser(companyId, u.lead, T1)).toMatchObject({ deactivated: 1 });
    const rows = await directoryRows(P1, "project.lead.vacated");
    expect(rows).toHaveLength(1);
    expect(rows[0]).toMatchObject({ actor: "system:directory", source: "directory", payload: { userId: u.lead } });
    expect(await directoryRows(P2, "project.lead.vacated")).toHaveLength(0);
    expect(await directoryRows(P1, "project.member")).toHaveLength(0); // the lead is vacated, not taken off as a member
  });

  it("deactivating a member who owns an open step takes them off P1 with unassign, and vacates the project they lead", async () => {
    await deactivateUser(companyId, u.member, T2);
    const off = await directoryRows(P1, "project.member");
    expect(off).toHaveLength(1);
    expect(off[0]).toMatchObject({ actor: "system:directory", source: "directory", payload: { userId: u.member, on: false, unassign: true } });
    const vacated = await directoryRows(P2, "project.lead.vacated");
    expect(vacated).toHaveLength(1);
    expect(vacated[0].payload).toMatchObject({ userId: u.member });
  });

  it("the same leavers twice write nothing new", async () => {
    const before = await directoryCount();
    expect(await deactivateUser(companyId, u.lead, T3)).toMatchObject({ deactivated: 0 });
    expect(await deactivateUser(companyId, u.member, T3)).toMatchObject({ deactivated: 0 });
    expect(await directoryCount()).toBe(before);
  });

  it("a directory page that drops the sponsor writes project.member off with unassign, once", async () => {
    const page: DirectoryPage = { entries: [entry({ externalId: "oid-sponsor", email: "sponsor@mov-leaver.example", active: false })], groups: [], removedExternalIds: [], nextCursor: null };
    expect(await applyDirectoryDelta(companyId, "graph", page, T3)).toMatchObject({ deactivated: 1 });
    const off = await directoryRows(P1, "project.member");
    expect(off.filter((r) => (r.payload as { userId?: string }).userId === u.sponsor)).toHaveLength(1);
    expect(off.find((r) => (r.payload as { userId?: string }).userId === u.sponsor)).toMatchObject({ actor: "system:directory", payload: { on: false, unassign: true } });
    const before = await directoryCount();
    expect(await applyDirectoryDelta(companyId, "graph", page, T3)).toMatchObject({ deactivated: 0 });
    expect(await directoryCount()).toBe(before);
  });

  it("a leaver who came back and was appointed again, then leaves again, is a new departure", async () => {
    // The lead comes back and the boss names them lead again; the member is back too, on P1 and leading P2.
    await db.user.updateMany({ where: { companyId, id: { in: [u.lead, u.member] } }, data: { active: true, deactivatedAt: null } });
    await add("project.lead.changed", P1, { to: "lead", toUserId: u.lead });
    await add("project.member", P1, { userId: u.member, on: true, name: "member" }, u.lead);
    await add("project.lead.changed", P2, { to: "member", toUserId: u.member });

    await deactivateUser(companyId, u.lead, T4);
    await deactivateUser(companyId, u.member, T5);
    const vacatedOne = await directoryRows(P1, "project.lead.vacated");
    expect(vacatedOne).toHaveLength(2);
    expect(new Set(vacatedOne.map((r) => r.idemKey)).size).toBe(2);
    expect(await directoryRows(P2, "project.lead.vacated")).toHaveLength(2);
    const memberOff = (await directoryRows(P1, "project.member")).filter((r) => (r.payload as { userId?: string }).userId === u.member);
    expect(memberOff).toHaveLength(2);
    expect(new Set(memberOff.map((r) => r.idemKey)).size).toBe(2);

    // The same second departure again changes nothing.
    const before = await directoryCount();
    await deactivateUser(companyId, u.lead, T5);
    await deactivateUser(companyId, u.member, T5);
    expect(await directoryCount()).toBe(before);
  });

  it("writes nothing for a stopped project", async () => {
    await add("project.stopped", P2, { why: "test" });
    await db.user.updateMany({ where: { companyId, id: u.member }, data: { active: true, deactivatedAt: null } });
    const before = (await directoryRows(P2, "project.lead.vacated")).length;
    await deactivateUser(companyId, u.member, new Date("2026-11-09T10:00:00Z"));
    expect(await directoryRows(P2, "project.lead.vacated")).toHaveLength(before);
  });
});
