// The CaseView projection against a real Postgres (VIS-B1): rows equal the full reducer after appends
// and after a rebuild, a projection error never fails an append, and the readers answer for one company.
import { afterAll, beforeAll, describe, expect, it, vi } from "vitest";
import { meFor, meOfSeat } from "@/features/auth/identity";
import type { CaseEventType, EventPayload } from "@/features/cases/events";
import { reduce } from "@/features/cases/reducer";
import { accessKeys, unitsOf, viewerKeys, type VisCtx } from "@/features/cases/visibility";
import { templateWrites } from "@/features/demo/content";
import { toSeedJson } from "@/features/demo/parse";
import { getDb } from "@/lib/db/client";
import { bindDemoCompany } from "@/lib/db/demo-identity";
import { appendEventRow, loadLog } from "@/lib/db/events";
import { loadSeats } from "@/lib/db/holders";
import { loadKnowledge } from "@/lib/db/knowledge";
import { loadSeed } from "@/lib/db/companies";
import { rebuildProjections } from "@/lib/db/projections/case-view";
import { caseView, inboxView, metricInputs, visibleCaseIds } from "@/lib/db/projections/readers";
import { visibleTo } from "@/lib/db/projections/visible";
import { writeStructure } from "@/lib/db/structure-writes";

const control = vi.hoisted(() => ({ fail: false }));
vi.mock("@/lib/db/projections/case-view", async (importOriginal) => {
  const real = await importOriginal<typeof import("@/lib/db/projections/case-view")>();
  return {
    ...real,
    projectCases: (...args: Parameters<typeof real.projectCases>) => {
      if (control.fail) throw new Error("projection down");
      return real.projectCases(...args);
    },
  };
});

const db = getDb();
const WINDOW = { sinceDay: -1_000_000, limit: 500 };
let companyId = "";
let otherId = "";
const ids = { manager: "", leader: "", member: "" };
let seatA = "";
let seatB = "";
let deputySeat = "";

async function add(type: CaseEventType, actor: string, targetId: string | null, payload: EventPayload = {}, userId: string | null = null) {
  const r = await appendEventRow(companyId, { id: crypto.randomUUID(), day: 0, type, actor, targetId, payload }, { actorUserId: userId });
  expect(r.ok).toBe(true);
}

async function expectRowsEqualReducer(opts: { every: boolean }) {
  const [seed, seats, knowledge] = await Promise.all([loadSeed("vis-proj"), loadSeats(companyId), loadKnowledge(companyId)]);
  const state = reduce({ ...seed!, seats }, await loadLog(companyId));
  const ctx: VisCtx = { seats, roles: knowledge.roles.map((r) => ({ id: r.id, orgUnitId: r.orgUnitId, reportsToId: r.reportsToId })), projects: state.projects };
  const rows = await db.caseView.findMany({ where: { companyId } });
  const byId = new Map(rows.map((r) => [r.caseId, r]));
  if (opts.every) expect(rows).toHaveLength(state.cases.length);
  let checked = 0;
  for (const c of state.cases) {
    const row = byId.get(c.id);
    if (!row) { expect(opts.every || c.seed).toBe(true); continue; }
    checked++;
    expect({
      status: row.status, open: row.open, seat: row.assigneeSeatId, role: row.assigneeRoleId, esc: row.escalatedRoleId,
      due: row.dueDay, last: row.lastDay, keys: [...row.accessKeys].sort(),
    }).toEqual({
      status: c.status, open: c.open, seat: c.assigneeSeatId, role: c.assigneeRoleId, esc: c.escalated?.toRoleId ?? null,
      due: c.dueDay, last: c.history.reduce((m, e) => Math.max(m, e.day), c.raisedDay), keys: [...accessKeys(c, ctx)].sort(),
    });
  }
  return { checked, state };
}

beforeAll(async () => {
  await db.company.deleteMany({ where: { slug: { in: ["vis-proj", "vis-proj-other"] } } });
  const writes = templateWrites("demo", () => crypto.randomUUID());
  const person = (name: string, role: string, handle?: string) => ({
    name, email: name.replace(/\W+/g, "").toLowerCase() + "@vis-proj.example", role, dept: "", ini: "XX", handle: handle ?? null,
  });
  const c = await db.company.create({
    data: {
      slug: "vis-proj", name: "VIS proj", stage: "pilot", seedJson: toSeedJson(writes.seedJson) as object,
      users: { create: [person("B. Hartmann", "manager"), person("T. Vogel", "leader"), person("J. Schmidt", "member", "Anonymous #4471")] },
    },
  });
  companyId = c.id;
  await writeStructure(c.id, writes, "test");
  await bindDemoCompany(c.id);
  const users = await db.user.findMany({ where: { companyId }, select: { id: true, name: true } });
  const idOf = (n: string) => users.find((u) => u.name === n)!.id;
  ids.manager = idOf("B. Hartmann"); ids.leader = idOf("T. Vogel"); ids.member = idOf("J. Schmidt");
  const seed = (await loadSeed("vis-proj"))!;
  seatA = seed.routes[0].ownerSeatId!;
  seatB = seed.routes[1].ownerSeatId!;
  deputySeat = seed.routes[0].deputySeatId!;
  const o = await db.company.create({ data: { slug: "vis-proj-other", name: "Other", seedJson: {} } });
  otherId = o.id;
  await db.caseView.create({
    data: { companyId: otherId, caseId: "other-case", kind: "problem", status: "open", open: true, dueDay: 1, lastDay: 1, lastSeq: 1, accessKeys: ["all", "m", "u:" + ids.member] },
  });
});

afterAll(async () => {
  await db.company.deleteMany({ where: { slug: { in: ["vis-proj", "vis-proj-other"] } } });
  await db.$disconnect();
});

describe("VIS projections match the reducer", () => {
  it("keeps every row equal to the full reducer through 30 events, a rebuild, and a failing projection", async () => {
    const raised = (title: string, extra: EventPayload = {}): EventPayload => ({
      title, body: "b", routeId: null, assignee: "Triage desk", assigneeRoleHolderId: seatA, fromDept: "PRD", kind: "problem", ...extra,
    });
    const M = "J. Schmidt";
    const L = "T. Vogel";
    const B = "B. Hartmann";
    // n1: raise, read, question, answer, hand-over, decision
    await add("case.raised", M, "n1", raised("n1"), ids.member);
    await add("case.read", B, "n1", {}, ids.manager);
    await add("case.asked", B, "n1", { text: "q" }, ids.manager);
    await add("case.answered", M, "n1", { text: "a" }, ids.member);
    await add("case.handed", B, "n1", { to: "x", toRoleHolderId: seatB, why: "w" }, ids.manager);
    await add("case.decided", B, "n1", { answer: "no", reason: "r" }, ids.manager);
    // n2: a custom audience by id
    await add("case.raised", L, "n2", raised("n2", { visibility: "custom", seenBy: ["J. Schmidt"], seenByUserIds: [ids.member] }), ids.leader);
    await add("case.read", B, "n2", {}, ids.manager);
    await add("case.commented", L, "n2", { text: "c1" }, ids.leader);
    await add("case.commented", M, "n2", { text: "c2" }, ids.member);
    await add("case.handed", B, "n2", { to: "x", toRoleHolderId: seatB }, ids.manager);
    await add("case.asked", B, "n2", { text: "q" }, ids.manager);
    await add("case.answered", L, "n2", { text: "a" }, ids.leader);
    // n3: private
    await add("case.raised", M, "n3", raised("n3", { visibility: "private" }), ids.member);
    await add("case.read", B, "n3", {}, ids.manager);
    await add("case.commented", M, "n3", { text: "c" }, ids.member);
    await add("case.handed", B, "n3", { to: "x", toRoleHolderId: seatB }, ids.manager);
    // n4: everyone, with a discussion
    await add("case.raised", L, "n4", raised("n4", { visibility: "everyone", kind: "idea" }), ids.leader);
    await add("case.read", B, "n4", {}, ids.manager);
    await add("case.discussion", B, "n4", { invited: ["J. Schmidt"], invitedUserIds: [ids.member], missing: "m" }, ids.manager);
    await add("case.invited", B, "n4", { invited: ["T. Vogel"], invitedUserIds: [ids.leader] }, ids.manager);
    await add("case.checkin", B, "n4", { next: "round", open: ["x"], note: "n" }, ids.manager);
    await add("case.revised", L, "n4", { body: "better" }, ids.leader);
    await add("case.commented", M, "n4", { text: "c" }, ids.member);
    await add("case.checkin", B, "n4", { next: "decide", open: [], note: "n" }, ids.manager);
    // n5: no choice, then the deadline fact moves it to the deputy
    await add("case.raised", B, "n5", raised("n5"), ids.manager);
    await add("case.read", B, "n5", {}, ids.manager);
    await add("clock.due", "system:clock", "n5", { kind: "deadline", dueDay: 1, toRoleHolderId: deputySeat });
    await add("case.commented", B, "n5", { text: "c" }, ids.manager);
    await add("case.commented", B, "n5", { text: "d" }, ids.manager);
    expect(await db.caseEvent.count({ where: { companyId } })).toBe(30);

    const afterAppends = await expectRowsEqualReducer({ every: false });
    expect(afterAppends.checked).toBeGreaterThanOrEqual(5);
    for (const id of ["n1", "n2", "n3", "n4", "n5"]) expect(await caseView(companyId, id)).not.toBeNull();

    await db.caseView.deleteMany({ where: { companyId } });
    const n = await rebuildProjections(companyId);
    const afterRebuild = await expectRowsEqualReducer({ every: true });
    expect(n).toBe(afterRebuild.state.cases.length);
    expect(afterRebuild.state.cases.some((c) => c.seed)).toBe(true);
    for (const c of afterRebuild.state.cases.filter((x) => x.seed)) expect(await caseView(companyId, c.id)).not.toBeNull();

    // a projection that throws does not fail the append
    control.fail = true;
    const spy = vi.spyOn(console, "error").mockImplementation(() => {});
    try {
      const r = await appendEventRow(companyId, { id: crypto.randomUUID(), day: 0, type: "case.commented", actor: B, targetId: "n5", payload: { text: "e" } }, {});
      expect(r).toEqual({ ok: true, duplicate: false });
      expect(spy).toHaveBeenCalled();
    } finally {
      control.fail = false;
      spy.mockRestore();
    }
  });
});

describe("VIS projection readers", () => {
  it("lists the escalated case on the deputy's inbox", async () => {
    await rebuildProjections(companyId);
    const seats = await loadSeats(companyId);
    const knowledge = await loadKnowledge(companyId);
    const me = meOfSeat(deputySeat, seats);
    const keys = viewerKeys(me, "leader", unitsOf(me, knowledge));
    const inbox = await inboxView(companyId, keys, me);
    expect(inbox.map((r) => r.caseId)).toContain("n5");
    expect(inbox.every((r) => r.open)).toBe(true);
  });

  it("gives a member their own and shared cases only", async () => {
    const keys = await visibleTo(companyId, ids.member);
    const got = await visibleCaseIds(companyId, keys, WINDOW);
    for (const id of ["n1", "n2", "n3", "n4"]) expect(got).toContain(id);
    expect(got).not.toContain("n5");
    const rows = await db.caseView.findMany({ where: { companyId, caseId: { in: got } } });
    for (const r of rows) expect(r.fromUserId === ids.member || r.accessKeys.includes("all") || r.accessKeys.includes("u:" + ids.member)).toBe(true);
    const manager = await visibleCaseIds(companyId, await visibleTo(companyId, ids.manager), WINDOW);
    expect(manager).toContain("n5");
    expect(manager).not.toContain("n3");
    expect(await visibleCaseIds(companyId, keys, { sinceDay: WINDOW.sinceDay, limit: 2 })).toHaveLength(2);
  });

  it("gives a user's keys from their seats and role", async () => {
    const seats = await loadSeats(companyId);
    const knowledge = await loadKnowledge(companyId);
    for (const [userId, role] of [[ids.manager, "manager"], [ids.leader, "leader"], [ids.member, "member"]] as const) {
      const me = meFor(userId, seats);
      expect(await visibleTo(companyId, userId)).toEqual(viewerKeys(me, role, unitsOf(me, knowledge)));
    }
    expect(await visibleTo(companyId, "nobody")).toEqual(["all"]);
  });

  it("never shows another company's rows", async () => {
    const keys = await visibleTo(companyId, ids.manager);
    expect(await visibleCaseIds(companyId, keys, WINDOW)).not.toContain("other-case");
    expect(await caseView(companyId, "other-case")).toBeNull();
    expect((await metricInputs(companyId, -1_000_000, 1_000_000)).map((r) => r.caseId)).not.toContain("other-case");
    expect(await visibleCaseIds(otherId, keys, WINDOW)).toEqual(["other-case"]);
    expect(await inboxView(otherId, keys, meFor(ids.manager, []))).toEqual([]);
  });
});
