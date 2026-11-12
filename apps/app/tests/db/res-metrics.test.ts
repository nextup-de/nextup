// RES-K1 (B2): the Dashboard counts the stalled projects per unit on the server path (plan RES, D22): ledgerInputs reduces the
// company's log once and the breakdown reads the standing stalled escalations. A sandbox company; the project is started through
// events, the stalled fact is written as an event (no clock run needed), and a later project.step.added ends it.
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import type { CaseEventType, EventPayload } from "@/features/cases/events";
import { workdayOf } from "@/features/clock/calendar";
import { DEFAULT_CALENDAR } from "@/features/clock";
import { toSeedJson } from "@/features/demo/parse";
import { SEED } from "@/features/demo/seed";
import { getDb } from "@/lib/db/client";
import { appendEventRow } from "@/lib/db/events";
import { dashboardData, ledgerInputs } from "@/lib/db/metrics";
import { rebuildProjections } from "@/lib/db/projections/case-view";

const db = getDb();
const SLUG = "res-stalled-co";
let companyId = "";
const units: Record<"u1" | "u2", string> = { u1: "", u2: "" };
const users: Record<string, string> = {};
const seats: Record<string, string> = {};
const names: string[] = [];

const today = () => workdayOf(new Date(), DEFAULT_CALENDAR);
async function add(type: CaseEventType, target: string, payload: EventPayload = {}, by: string | null = null) {
  const r = await appendEventRow(companyId, { id: crypto.randomUUID(), day: 0, type, actor: "Someone", targetId: target, payload }, { actorUserId: by });
  expect(r).toEqual({ ok: true, duplicate: false });
}
const raise = (id: string, route: "r-u1" | "r-u2", by: string) =>
  add("case.raised", id, { title: id, body: "b", routeId: route, assignee: "Desk", assigneeRoleHolderId: seats[route === "r-u1" ? "a1" : "b1"], fromDept: "X", kind: "problem" }, users[by]);
/** A yes with a project, a baseline and a start: the project runs. */
async function run(caseId: string, projectId: string, desk: string) {
  await add("case.decided", caseId, { answer: "yes", reason: "go", projectId, lead: "Lead", leadUserId: users[desk] }, users[desk]);
  await add("project.baseline", projectId, { metric: "Scrap", unit: "%", value: 9, better: "down", source: "QMS" }, users[desk]);
  await add("project.started", projectId, {}, users[desk]);
}
const stalledFact = (projectId: string, toSeat: string) => add("clock.due", projectId, { kind: "stalled", dueDay: today(), toRoleHolderId: seats[toSeat] });

beforeAll(async () => {
  await db.company.deleteMany({ where: { slug: SLUG } });
  const c = await db.company.create({ data: { slug: SLUG, name: SLUG, stage: "sandbox", seedJson: toSeedJson(SEED) as object } });
  companyId = c.id;
  const mk = async (name: string) => {
    names.push(name);
    return (await db.user.create({ data: { companyId, name, email: `${name.replace(/\W+/g, "").toLowerCase()}@${SLUG}.example`, role: "member", active: true }, select: { id: true } })).id;
  };
  units.u1 = (await db.orgUnit.create({ data: { companyId, key: "U1", name: "Unit One", headcount: 6, sort: 0 } })).id;
  units.u2 = (await db.orgUnit.create({ data: { companyId, key: "U2", name: "Unit Two", headcount: 6, sort: 1 } })).id;
  const role = async (unit: string, title: string, sort: number) => (await db.orgRole.create({ data: { companyId, orgUnitId: unit, title, sort } })).id;
  const r1 = await role(units.u1, "Desk One", 0);
  const r2 = await role(units.u2, "Desk Two", 1);
  let sort = 0;
  for (const [key, roleId] of [["a1", r1], ["a2", r1], ["a3", r1], ["a4", r1], ["a5", r1], ["a6", r1], ["b1", r2], ["b2", r2], ["b3", r2], ["b4", r2], ["b5", r2], ["b6", r2]] as const) {
    users[key] = await mk(`Person ${key}`);
    seats[key] = (await db.orgRoleHolder.create({ data: { companyId, roleId, name: `Seat ${key}`, userId: users[key], sort: sort++ } })).id;
  }
  await db.routingRule.create({ data: { companyId, key: "r-u1", type: "Q1", keywords: ["one"], ownerRoleId: r1, sort: 0 } });
  await db.routingRule.create({ data: { companyId, key: "r-u2", type: "Q2", keywords: ["two"], ownerRoleId: r2, sort: 1 } });

  // c1: said yes by Unit One's desk, its project stalls. c2: raised from Unit One, said yes by Unit Two's desk: it counts in Unit Two.
  // c3: Unit One's project is quiet only (no stalled fact). c4: Unit Two's project stalled, then its lead did something.
  await raise("c1", "r-u1", "a1"); await run("c1", "p1", "a2"); await stalledFact("p1", "a3");
  await raise("c2", "r-u2", "a1"); await run("c2", "p2", "b2"); await stalledFact("p2", "b3");
  await raise("c3", "r-u1", "a4"); await run("c3", "p3", "a2");
  await raise("c4", "r-u2", "b4"); await run("c4", "p4", "b2"); await stalledFact("p4", "b3");
  await add("project.step.added", "p4", { stepId: "s1", text: "Try it" }, users.b2);
  await rebuildProjections(companyId);
}, 60_000);

afterAll(async () => {
  await db.company.deleteMany({ where: { slug: SLUG } });
  await db.$disconnect();
});

const period = () => ({ from: today() - 20, to: today() });

describe("RES stalled", () => {
  it("ledgerInputs lists the projects whose stalled fact stands, in the unit of the desk that said yes", async () => {
    const input = await ledgerInputs(companyId, period());
    const byProject = Object.fromEntries(input.stalled.map((s) => [s.projectId, s.unitId]));
    expect(byProject).toEqual({ p1: units.u1, p2: units.u2 }); // p3 is only quiet, p4 had activity after its fact
    expect(input.stalled).toHaveLength(2);
  });

  it("the dashboard reader counts them per unit and says nothing else about them", async () => {
    const data = await dashboardData(companyId, { unitId: null, kind: "30d" });
    const row = (id: string) => data.units.find((u) => u.id === id)!;
    expect(row(units.u1)).toMatchObject({ hidden: false, stalled: 1 });
    expect(row(units.u2)).toMatchObject({ hidden: false, stalled: 1 });
    for (const r of data.roles) expect(r.stalled, r.id).toBeNull();
    const text = JSON.stringify(data);
    for (const secret of ["p1", "p2", "p4", "Lead", ...names]) expect(text, secret).not.toContain(`"${secret}"`);
  });

  it("the input lists what stands today whatever the period; the breakdown decides per period", async () => {
    const past = await ledgerInputs(companyId, { from: today() - 40, to: today() - 21 });
    expect(past.stalled).toHaveLength(2);
  });

  it("once there was activity after the fact the project no longer counts", async () => {
    await add("project.step.added", "p1", { stepId: "s2", text: "Try it again" }, users.a2);
    await rebuildProjections(companyId);
    const input = await ledgerInputs(companyId, period());
    expect(input.stalled.map((s) => s.projectId)).toEqual(["p2"]);
    const data = await dashboardData(companyId, { unitId: null, kind: "30d" });
    expect(data.units.find((u) => u.id === units.u1)!.stalled).toBe(0);
    expect(data.units.find((u) => u.id === units.u2)!.stalled).toBe(1);
  });
});
