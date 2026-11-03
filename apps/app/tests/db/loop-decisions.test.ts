// The decision log against a real Postgres (LOOP-D1): who sees which decision, the filters, the paging,
// the company wall and the deciding desk's role.
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import type { CaseEventType, EventPayload } from "@/features/cases/events";
import { templateWrites } from "@/features/demo/content";
import { toSeedJson } from "@/features/demo/parse";
import { getDb } from "@/lib/db/client";
import { bindDemoCompany } from "@/lib/db/demo-identity";
import { appendEventRow } from "@/lib/db/events";
import { loadSeed } from "@/lib/db/companies";
import { rebuildProjections } from "@/lib/db/projections/case-view";
import { decisionLog } from "@/lib/db/projections/decisions";
import { visibleTo } from "@/lib/db/projections/visible";
import { writeStructure } from "@/lib/db/structure-writes";

const db = getDb();
const NOW = new Date("2026-11-03T10:00:00Z");
let companyId = "";
let otherId = "";
let managerKeys: string[] = [];
let memberKeys: string[] = [];
const ids = { manager: "", member: "" };
let seat = "";

async function add(cid: string, type: CaseEventType, actor: string, targetId: string, day: number, payload: EventPayload, userId: string | null) {
  const r = await appendEventRow(cid, { id: crypto.randomUUID(), day, type, actor, targetId, payload }, { actorUserId: userId });
  expect(r.ok).toBe(true);
}

type Spec = { title: string; day: number; answer: "yes" | "no"; reason?: string; visibility: "everyone" | "private"; by: "member" | "manager"; projectId?: string; kind?: "problem" | "idea" };

async function decided(id: string, o: Spec) {
  const name = o.by === "member" ? "J. Schmidt" : "B. Hartmann";
  await add(companyId, "case.raised", name, id, o.day, {
    title: o.title, body: "b", routeId: null, assignee: "Triage desk", assigneeRoleHolderId: seat, fromDept: "PRD", kind: o.kind ?? "problem", visibility: o.visibility,
  }, ids[o.by]);
  await add(companyId, "case.decided", "B. Hartmann", id, o.day + 1, {
    answer: o.answer, ...(o.reason ? { reason: o.reason } : {}), ...(o.projectId ? { projectId: o.projectId, lead: "B. Hartmann" } : {}),
  }, ids.manager);
  // the append stamps the company's own day; the test sets the day it wants to filter on
  await db.caseEvent.updateMany({ where: { companyId, targetId: id, type: "case.decided" }, data: { day: o.day + 1 } });
}

const total = async (keys: string[], filter: Parameters<typeof decisionLog>[2]) => (await decisionLog(companyId, keys, filter)).total;

beforeAll(async () => {
  await db.company.deleteMany({ where: { slug: { in: ["loop-dec", "loop-dec-other"] } } });
  const writes = templateWrites("demo", () => crypto.randomUUID());
  const person = (name: string, role: string, handle?: string) => ({
    name, email: name.replace(/\W+/g, "").toLowerCase() + "@loop-dec.example", role, dept: "", ini: "XX", handle: handle ?? null,
  });
  const c = await db.company.create({
    data: {
      slug: "loop-dec", name: "LOOP dec", stage: "pilot", seedJson: toSeedJson(writes.seedJson) as object,
      users: { create: [person("B. Hartmann", "manager"), person("J. Schmidt", "member", "Anonymous #4471")] },
    },
  });
  companyId = c.id;
  await writeStructure(c.id, writes, "test");
  await bindDemoCompany(c.id);
  const users = await db.user.findMany({ where: { companyId }, select: { id: true, name: true } });
  ids.manager = users.find((u) => u.name === "B. Hartmann")!.id;
  ids.member = users.find((u) => u.name === "J. Schmidt")!.id;
  seat = (await loadSeed("loop-dec"))!.routes[0].ownerSeatId!;

  await decided("d1", { title: "Shared forklift", day: 10, answer: "yes", reason: "Start on line 3", visibility: "everyone", by: "manager" });
  await decided("d2", { title: "Scrap bins", day: 20, answer: "no", reason: "Covered by the yard system", visibility: "everyone", by: "member" });
  await decided("d3", { title: "Handover checklist", day: 30, answer: "yes", visibility: "everyone", by: "manager", projectId: "p-d3", kind: "idea" });
  await decided("d4", { title: "Secret plan", day: 40, answer: "yes", visibility: "private", by: "manager" });
  await decided("d5", { title: "My private note", day: 50, answer: "yes", visibility: "private", by: "member" });
  for (let i = 0; i < 60; i++) await decided(`pg${i}`, { title: `page-${i}`, day: 100 + i, answer: "yes", visibility: "everyone", by: "manager" });
  await rebuildProjections(companyId, NOW);
  managerKeys = await visibleTo(companyId, ids.manager);
  memberKeys = await visibleTo(companyId, ids.member);

  const o = await db.company.create({ data: { slug: "loop-dec-other", name: "Other", seedJson: {} } });
  otherId = o.id;
  await db.caseView.create({ data: { companyId: otherId, caseId: "o1", kind: "problem", status: "decided", open: false, dueDay: 1, lastDay: 1, lastSeq: 1, accessKeys: ["all"] } });
  await add(otherId, "case.decided", "X", "o1", 1, { answer: "yes", reason: "other company" }, null);
});

afterAll(async () => {
  await db.company.deleteMany({ where: { slug: { in: ["loop-dec", "loop-dec-other"] } } });
  await db.$disconnect();
});

describe("LOOP decision log", () => {
  it("a member gets their own and the public decisions, a manager all, newest first", async () => {
    // private lets nobody else open the case (visibility.ts): not even a manager
    // the manager sees the 60 public page-N, d1, d2, d3 and their own d4, never the member's d5
    expect(await total(managerKeys, {})).toBe(64);
    expect(await total(managerKeys, { q: "My private note" })).toBe(0);
    expect(await total(managerKeys, { q: "Secret plan" })).toBe(1);
    // the member sees the 60 public page-N, d1, d2, d3 and their own d5, never d4
    expect(await total(memberKeys, {})).toBe(64);
    expect(await total(memberKeys, { q: "Secret plan" })).toBe(0);
    expect(await total(memberKeys, { q: "My private note" })).toBe(1);
    expect(await total(["all", "m"], {})).toBe(63);

    const rows = (await decisionLog(companyId, managerKeys, {})).rows;
    expect(rows[0].caseId).toBe("pg59");
    const days = rows.map((r) => r.day);
    expect(days).toEqual([...days].sort((a, b) => b - a));
  });

  it("answer, project, search and fromDay each narrow it", async () => {
    expect((await decisionLog(companyId, managerKeys, { answer: "no" })).rows.map((r) => r.caseId)).toEqual(["d2"]);
    const withProject = await decisionLog(companyId, managerKeys, { project: "with" });
    expect(withProject.rows.map((r) => r.caseId)).toEqual(["d3"]);
    expect(withProject.rows[0].projectId).toBe("p-d3");
    expect(await total(managerKeys, { project: "without" })).toBe(63);

    const byReason = await decisionLog(companyId, managerKeys, { q: "yard system" });
    expect(byReason.rows.map((r) => r.caseId)).toEqual(["d2"]);
    expect(byReason.rows[0]).toMatchObject({ title: "Scrap bins", kind: "problem", answer: "no", reason: "Covered by the yard system" });
    expect(await total(managerKeys, { q: "100%" })).toBe(0); // % is a letter, not a wildcard

    // decisions fall on days 11, 21, 31, 41 (d4, the manager's own) and 101..160
    expect(await total(managerKeys, { fromDay: 41 })).toBe(61);
    expect(await total(managerKeys, { fromDay: 41, answer: "no" })).toBe(0);
  });

  it("60 decisions page as 50 + 10", async () => {
    const p1 = await decisionLog(companyId, managerKeys, { q: "page-" }, 1);
    const p2 = await decisionLog(companyId, managerKeys, { q: "page-" }, 2);
    expect([p1.rows.length, p2.rows.length, p1.total, p2.total]).toEqual([50, 10, 60, 60]);
    expect(new Set([...p1.rows, ...p2.rows].map((r) => r.caseId)).size).toBe(60);
  });

  it("never shows another company's decisions", async () => {
    expect((await decisionLog(companyId, ["all"])).rows.some((r) => r.caseId === "o1")).toBe(false);
    expect((await decisionLog(otherId, ["all"])).rows.map((r) => r.caseId)).toEqual(["o1"]);
    expect(await total(["all"], { q: "other company" })).toBe(0);
  });

  it("roleId is the case's desk role", async () => {
    const row = (await decisionLog(companyId, managerKeys, { q: "Shared forklift" })).rows[0];
    const view = await db.caseView.findUnique({ where: { companyId_caseId: { companyId, caseId: "d1" } }, select: { assigneeRoleId: true } });
    expect(view?.assigneeRoleId).toBeTruthy();
    expect(row.roleId).toBe(view!.assigneeRoleId);
  });
});
