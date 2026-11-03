// MET-B1: the wait ledger's inputs from the projection and the log, and the manager-only dashboard actions.
// Test events go through appendEventRow (the writer VIS uses) on known working days, then rebuildProjections.
import { afterAll, beforeAll, describe, expect, it, vi } from "vitest";
import type { Viewer } from "@/features/auth/session";
import type { CaseEventType, EventPayload } from "@/features/cases/events";
import { DEFAULT_CALENDAR } from "@/features/clock";
import { workdayOf } from "@/features/clock/calendar";
import { toSeedJson } from "@/features/demo/parse";
import { SEED } from "@/features/demo/seed";
import { createT } from "@/i18n";
import { getDb } from "@/lib/db/client";
import { appendEventRow } from "@/lib/db/events";
import { dashboardData, ledgerInputs } from "@/lib/db/metrics";
import { rebuildProjections } from "@/lib/db/projections/case-view";

let viewer: Viewer | null = null;
vi.mock("@/features/auth/session", () => ({ getViewerFor: vi.fn(async (slug: string) => (viewer && viewer.companySlug === slug ? viewer : null)) }));
vi.mock("next/cache", () => ({ revalidatePath: vi.fn() }));

import { exportDashboardCsvAction, loadDashboardAction, saveBaselineAction } from "@/server/actions/metrics";

const db = getDb();
const SLUGS = ["met-reader-a", "met-reader-b"];

type Co = {
  id: string; slug: string; manager: string; leader: string; inactiveManager: string;
  u1: string; u2: string; roles: Record<string, string>; seats: Record<string, string>; users: Record<string, string>;
  names: string[];
};
const co: Record<"a" | "b", Co> = { a: null as never, b: null as never };

// Monday 2026-09-07 is working day D0; offset n is the n-th working day after it.
const D0 = workdayOf(new Date("2026-09-07T10:00:00Z"), DEFAULT_CALENDAR);
const dates = ["07", "08", "09", "10", "11", "14", "15", "16", "17", "18", "21", "22"].map((d) => `2026-09-${d}`);
const at = (n: number) => new Date(`${dates[n]}T10:00:00Z`);
const PERIOD = { from: D0, to: D0 + 20 };

async function makeCompany(slug: string, sizes: [number, number], extraInactive: boolean): Promise<Co> {
  const c = await db.company.create({ data: { slug, name: slug, stage: "pilot", seedJson: toSeedJson(SEED) as object } });
  const names: string[] = [];
  const mk = async (name: string, role: string, active = true, handle: string | null = null) => {
    names.push(name);
    if (handle) names.push(handle);
    return (await db.user.create({ data: { companyId: c.id, name, email: `${name.replace(/\W+/g, "")}@${slug}.example`, role, active, handle }, select: { id: true } })).id;
  };
  const manager = await mk(`Mara Boss ${slug}`, "manager");
  const leader = await mk(`Lena Lead ${slug}`, "leader");
  const inactiveManager = await mk(`Ines Gone ${slug}`, "manager", false);
  const u1 = (await db.orgUnit.create({ data: { companyId: c.id, key: "U1", name: "Unit One", headcount: sizes[0], sort: 0 } })).id;
  const u2 = (await db.orgUnit.create({ data: { companyId: c.id, key: "U2", name: "Unit Two", headcount: sizes[1], sort: 1 } })).id;
  const role = async (unit: string, title: string, sort: number) => (await db.orgRole.create({ data: { companyId: c.id, orgUnitId: unit, title, sort } })).id;
  const roles = { r1a: await role(u1, "Desk One A", 0), r1b: await role(u1, "Desk One B", 1), r2: await role(u2, "Desk Two", 2) };
  const users: Record<string, string> = {};
  const seats: Record<string, string> = {};
  let sort = 0;
  const seat = async (key: string, roleId: string, active = true) => {
    const userName = `Person ${key} ${slug}`;
    users[key] = await mk(userName, "member", active, `Anonymous #${key}${slug}`);
    seats[key] = (await db.orgRoleHolder.create({ data: { companyId: c.id, roleId, name: `Seat ${key}`, userId: users[key], sort: sort++ } })).id;
  };
  // Unit One: 6 active people (+ one inactive seat holder); Unit Two: 3.
  for (const k of ["a1", "a2", "a3", "a4"]) await seat(k, roles.r1a);
  for (const k of ["a5", "a6"]) await seat(k, roles.r1b);
  if (extraInactive) await seat("a7", roles.r1b, false);
  for (const k of ["b1", "b2", "b3"]) await seat(k, roles.r2);
  await db.routingRule.create({ data: { companyId: c.id, key: "r-u1", type: "Q1", keywords: ["one"], ownerRoleId: roles.r1a, sort: 0 } });
  await db.routingRule.create({ data: { companyId: c.id, key: "r-u2", type: "Q2", keywords: ["two"], ownerRoleId: roles.r2, sort: 1 } });
  return { id: c.id, slug, manager, leader, inactiveManager, u1, u2, roles, seats, users, names };
}

async function add(c: Co, type: CaseEventType, target: string, n: number, payload: EventPayload = {}, by: string | null = null) {
  const r = await appendEventRow(c.id, { id: crypto.randomUUID(), day: 0, type, actor: "Someone", targetId: target, payload }, { actorUserId: by, now: at(n) });
  expect(r).toEqual({ ok: true, duplicate: false });
}

function raise(c: Co, id: string, n: number, route: "r-u1" | "r-u2" | null, seat: string, by: string, extra: EventPayload = {}) {
  return add(c, "case.raised", id, n, { title: id, body: "b", routeId: route, assignee: "Desk", assigneeRoleHolderId: c.seats[seat], fromDept: "X", kind: "problem", ...extra }, c.users[by]);
}

beforeAll(async () => {
  await db.company.deleteMany({ where: { slug: { in: SLUGS } } });
  co.a = await makeCompany(SLUGS[0], [6, 3], true);
  co.b = await makeCompany(SLUGS[1], [6, 3], false);
  const a = co.a;
  const m = a.manager;
  // c1: asked day 1, decided yes with a reason on day 3 (no project)
  await raise(a, "c1", 0, "r-u1", "a1", "a1");
  await add(a, "case.asked", "c1", 1, { text: "q" }, m);
  await add(a, "case.decided", "c1", 3, { answer: "yes", reason: "ok" }, m);
  // c2: an idea from Unit Two, decided yes with a project on day 2
  await raise(a, "c2", 0, "r-u1", "a1", "b1", { kind: "idea" });
  await add(a, "case.decided", "c2", 2, { answer: "yes", reason: "go", projectId: "p-c2", lead: "Someone" }, m);
  // c3: handed over on day 2, never answered
  await raise(a, "c3", 1, "r-u2", "b1", "a1");
  await add(a, "case.handed", "c3", 2, { to: "x", toRoleHolderId: a.seats.b2, why: "away" }, m);
  // c4: an idea decided no, with a reason, on day 4
  await raise(a, "c4", 1, "r-u2", "b1", "b2", { kind: "idea" });
  await add(a, "case.decided", "c4", 4, { answer: "no", reason: "not now" }, m);
  // c5: the deadline fact on day 5
  await raise(a, "c5", 2, "r-u1", "a1", "a2");
  await add(a, "clock.due", "c5", 5, { kind: "deadline", dueDay: D0 + 4, toRoleHolderId: a.seats.a2 });
  // c6: decided no WITHOUT a reason on day 6
  await raise(a, "c6", 3, "r-u1", "a1", "a3");
  await add(a, "case.decided", "c6", 6, { answer: "no" }, m);
  // c7: asked on day 7
  await raise(a, "c7", 5, "r-u2", "b1", "b3");
  await add(a, "case.asked", "c7", 7, { text: "q" }, m);
  // c8: handed over because of the deadline on day 8
  await raise(a, "c8", 6, "r-u1", "a1", "a4");
  await add(a, "case.handed", "c8", 8, { to: "x", toRoleHolderId: a.seats.a2, why: "deadline" }, m);
  // c9: the router proposed r-u2, the person kept r-u1 and an override was written; c10: the proposal was kept
  const proposal = (routeId: string) => ({ routeId, confidence: 80, source: "keywords" as const, version: "t" });
  await raise(a, "c9", 7, "r-u1", "a1", "a5", { proposal: proposal("r-u2") });
  await add(a, "case.override", "c9", 7, { proposed: "r-u2", chosen: "r-u1" }, a.users.a5);
  await raise(a, "c10", 8, "r-u1", "a1", "a6", { proposal: proposal("r-u1") });
  // c11: no route; the desk is a seat in Unit Two
  await raise(a, "c11", 9, null, "b2", "a5");
  // The other company: one case that must never show up in company A
  const b = co.b;
  await raise(b, "b-only", 0, "r-u1", "a1", "a1");
  await add(b, "case.decided", "b-only", 1, { answer: "yes", reason: "r" }, b.manager);
  await rebuildProjections(a.id);
  await rebuildProjections(b.id);
}, 60_000);

afterAll(async () => {
  await db.company.deleteMany({ where: { slug: { in: SLUGS } } });
  await db.$disconnect();
});

describe("MET ledger inputs", () => {
  it("gives the hand-checked days, units, roles, people and facts of the company", async () => {
    const a = co.a;
    const input = await ledgerInputs(a.id, PERIOD);
    const byId = new Map(input.cases.map((c) => [c.caseId, c]));
    expect([...byId.keys()].sort()).toEqual(["c1", "c10", "c11", "c2", "c3", "c4", "c5", "c6", "c7", "c8", "c9"].sort());
    expect(byId.has("b-only")).toBe(false);
    const rel = (d: number | null) => (d === null ? null : d - D0);
    const row = (id: string) => {
      const c = byId.get(id)!;
      return [rel(c.raisedDay), rel(c.firstResponseDay), rel(c.firstReasonedAnswerDay), rel(c.decidedDay), rel(c.escalatedDay)];
    };
    expect(row("c1")).toEqual([0, 1, 3, 3, null]);
    expect(row("c2")).toEqual([0, 2, 2, 2, null]);
    expect(row("c3")).toEqual([1, null, null, null, null]); // a hand-over is no answer
    expect(row("c4")).toEqual([1, 4, 4, 4, null]);
    expect(row("c5")).toEqual([2, null, null, null, 5]);
    expect(row("c6")).toEqual([3, 6, null, 6, null]); // an answer, but not a reasoned one
    expect(row("c7")).toEqual([5, 7, null, null, null]);
    expect(row("c8")).toEqual([6, null, null, null, 8]);

    expect(byId.get("c1")).toMatchObject({ kind: "problem", decision: "yes", withProject: false, reasoned: true, unitId: a.u1, roleId: a.roles.r1a, raiserUnitId: a.u1 });
    expect(byId.get("c2")).toMatchObject({ kind: "idea", decision: "yes", withProject: true, raiserUnitId: a.u2 });
    expect(byId.get("c4")).toMatchObject({ decision: "no", reasoned: true, unitId: a.u2, roleId: a.roles.r2, raiserUnitId: a.u2 });
    expect(byId.get("c6")).toMatchObject({ decision: "no", reasoned: false });
    expect(byId.get("c3")).toMatchObject({ unitId: a.u2, raiserUnitId: a.u1, open: true });
    // no route: the unit of the desk role
    expect(byId.get("c11")).toMatchObject({ unitId: a.u2, roleId: a.roles.r2, raiserUnitId: a.u1 });

    expect(input.facts.answers).toEqual({ yes: 1, yesProject: 1, question: 2, handed: 2, no: 2 });
    expect(input.facts.override).toEqual({ proposed: 2, overridden: 1, rate: 0.5 });

    const units = new Map(input.org.units.map((u) => [u.id, u]));
    expect(units.get(a.u1)).toMatchObject({ people: 6, headcount: 6 }); // the inactive seat holder is not counted
    expect(units.get(a.u2)).toMatchObject({ people: 3, headcount: 3 });
    const roles = new Map(input.org.roles.map((r) => [r.id, r]));
    expect(roles.get(a.roles.r1a)).toMatchObject({ people: 4, unitId: a.u1 });
    expect(roles.get(a.roles.r1b)).toMatchObject({ people: 2 });
    expect(roles.get(a.roles.r2)).toMatchObject({ people: 3, unitId: a.u2 });
    expect(input.promiseDays).toBe(5);
    expect(input.demoClock).toBe(false);
  });

  it("never mixes in another company and carries no name or handle", async () => {
    const [ia, ib] = [await ledgerInputs(co.a.id, PERIOD), await ledgerInputs(co.b.id, PERIOD)];
    expect(ib.cases.map((c) => c.caseId)).toEqual(["b-only"]);
    expect(ia.org.units.every((u) => ![co.b.u1, co.b.u2].includes(u.id))).toBe(true);
    const text = JSON.stringify(ia);
    for (const n of [...co.a.names, ...Object.values(co.a.users)]) expect(text).not.toContain(n);
    expect(ia.cases.every((c) => c.raiserKey === null || /^[0-9a-f]{16}$/.test(c.raiserKey))).toBe(true);
  });
});

describe("MET dashboard actions", () => {
  const as = (c: Co, userId: string, role: Viewer["role"]): Viewer => ({ userId, companyId: c.id, companySlug: c.slug, name: "n", handle: null, role, epoch: 0, issuedAt: 0 });
  const input = { unitId: null, kind: "30d" as const };

  it("refuses a leader, an inactive manager and a manager of another company", async () => {
    const a = co.a;
    for (const v of [as(a, a.leader, "leader"), as(a, a.inactiveManager, "manager"), as(co.b, co.b.manager, "manager"), null]) {
      viewer = v;
      expect(await loadDashboardAction(a.slug, input)).toEqual({ error: "forbidden" });
      expect(await exportDashboardCsvAction(a.slug, input, "unit")).toEqual({ error: "forbidden" });
      expect(await saveBaselineAction(a.slug, new FormData())).toEqual({ error: "forbidden" });
    }
    expect(await db.companyRule.count({ where: { companyId: a.id, key: "metrics_baseline" } })).toBe(0);
  });

  it("exports one line per unit row, hides the small unit and names nobody", async () => {
    const a = co.a;
    viewer = as(a, a.manager, "manager");
    const data = await loadDashboardAction(a.slug, input);
    expect("error" in data).toBe(false);
    const out = await exportDashboardCsvAction(a.slug, input, "unit");
    if ("error" in out) throw new Error("forbidden");
    const lines = out.body.trim().split("\n");
    const units = (data as { units: unknown[] }).units;
    expect(lines).toHaveLength(units.length + 1);
    expect(lines[0].split(";")).toHaveLength(6);
    const tooFew = createT("en")("metrics.csvTooFew");
    expect(lines.find((l) => l.startsWith("Unit Two;"))).toContain(tooFew);
    // Unit One is visible on its own, but it is Unit Two's only sibling: complementary suppression hides it too (D6).
    expect(lines.find((l) => l.startsWith("Unit One;"))).toContain(tooFew);
    expect(out.name).toMatch(/\.csv$/);
    for (const n of [...a.names, ...Object.values(a.users), ...Object.values(a.seats), a.manager]) expect(out.body).not.toContain(n);
    const roles = await exportDashboardCsvAction(a.slug, input, "role");
    if ("error" in roles) throw new Error("forbidden");
    expect(roles.body.trim().split("\n")).toHaveLength(4);
  });

  it("stores the baseline and compares the next dashboard with it", async () => {
    const a = co.a;
    viewer = as(a, a.manager, "manager");
    expect((await dashboardData(a.id, input)).baseline).toBeNull();

    const bad = new FormData();
    bad.set("fromDate", "2026-09-11");
    bad.set("toDate", "2026-09-07");
    expect(await saveBaselineAction(a.slug, bad)).toEqual({ error: "period" });

    const form = new FormData();
    form.set("fromDate", "2026-09-07");
    form.set("toDate", "2026-09-11");
    form.set("csv", "metric;value\nwithinPromisePct;70\n");
    form.set("source", "Sheet Q3");
    expect(await saveBaselineAction(a.slug, form)).toEqual({ ok: true });

    const data = await dashboardData(a.id, input);
    expect(data.baseline).toMatchObject({ fromDay: D0, toDay: D0 + 4, fromDate: "2026-09-07", toDate: "2026-09-11" });
    expect(data.baseline?.imported.withinPromisePct).toMatchObject({ value: 70, source: "Sheet Q3", importedBy: a.manager });
    const tile = (id: string) => data.tiles.find((t) => t.id === id)!;
    expect(tile("onTime").baseline).toBe(70); // imported, labelled in provenance
    expect(tile("firstReasonedAnswer").baseline).toBe(3); // counted: waits 3, 2, 3
    expect(await db.auditEvent.count({ where: { companyId: a.id, action: "audit.settings.metrics_baseline" } })).toBe(1);

    const bad2 = new FormData();
    bad2.set("fromDate", "2026-09-07");
    bad2.set("toDate", "2026-09-11");
    bad2.set("csv", "metric;value\nnope;1\n");
    bad2.set("source", "x");
    expect(await saveBaselineAction(a.slug, bad2)).toMatchObject({ error: "csv", reason: "key", line: 2 });
  });
});
