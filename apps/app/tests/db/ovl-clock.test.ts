// OVL-C1 (B2): one runClockOnce on a sandbox company in workdays mode writes the away and overflow hand-overs and the desk's overloaded fact, a second run
// writes nothing new, the handed cases' passes stay 0 and a desk that is eased writes desk.cleared (plan OVL, D15, D24, D26, D29). A real Postgres, its own
// company, fixed `now`. Flat tests (D32).
import { afterAll, beforeAll, expect, it } from "vitest";
import { reduce } from "@/features/cases/reducer";
import { DEFAULT_CALENDAR } from "@/features/clock";
import { workdayOf } from "@/features/clock/calendar";
import { templateWrites } from "@/features/demo/content";
import { toSeedJson } from "@/features/demo/parse";
import { DEFAULT_RULES } from "@/features/knowledge/rules";
import { getDb } from "@/lib/db/client";
import { companySeed } from "@/lib/db/companies";
import { appendEventRow, loadLog } from "@/lib/db/events";
import { addRole, addSeat, addUnit, saveRoute } from "@/lib/db/org-edit";
import { saveCompanyRules } from "@/lib/db/rules";
import { runClockOnce } from "@/server/scheduler/clock";

const db = getDb();
const SLUG = "ovl-clock";
const now = new Date("2026-05-04T09:00:00+02:00"); // a Monday
const D = workdayOf(now, DEFAULT_CALENDAR);
const earlier = new Date(now.getTime() - 3 * 86_400_000);
const ids: Record<string, string> = {};
let companyId = "";
let n = 0;
let busyRole = "";

async function append(type: string, actorUserId: string | null, targetId: string | null, payload: Record<string, unknown>, at: Date = now): Promise<void> {
  const r = await appendEventRow(companyId, { id: `${SLUG}-e${n++}`, day: 0, type, actor: actorUserId === null ? "system:test" : "Someone", targetId, payload } as never, { actorUserId, now: at });
  if (!r.ok) throw new Error(r.error);
}
const eventsOf = (type: string, extra: Record<string, unknown> = {}) => db.caseEvent.findMany({ where: { companyId, type, ...extra }, orderBy: { seq: "asc" } });
const handedBy = (why: string) => db.caseEvent.findMany({ where: { companyId, type: "case.handed", payload: { path: ["why"], equals: why } }, orderBy: { seq: "asc" } });
const total = () => db.caseEvent.count({ where: { companyId } });
const run = async () => (await runClockOnce(now)).find((r) => r.slug === SLUG)!.written;

beforeAll(async () => {
  await db.company.deleteMany({ where: { slug: SLUG } });
  const writes = templateWrites("empty", () => crypto.randomUUID());
  const person = (name: string, role: string) => ({ name, email: name.replace(/\W+/g, "").toLowerCase() + `@${SLUG}.example`, role, dept: "", ini: "XX", handle: null });
  const c = await db.company.create({
    data: {
      slug: SLUG, name: SLUG, stage: "sandbox", seedJson: toSeedJson(writes.seedJson) as object, config: { create: {} },
      users: { create: [person("A. Away", "leader"), person("D. Deputy", "leader"), person("H. Head", "leader"), person("X. One", "leader"), person("Y. Two", "leader"), person("R. Raiser", "member")] },
    },
  });
  companyId = c.id;
  for (const u of await db.user.findMany({ where: { companyId } })) ids[u.name] = u.id;

  // The org: a head, a desk with one holder (Owner, whose deputy is Deputy), and a second desk with two holders (Busy, whose deputy is Deputy too).
  const unit = await addUnit(companyId, "ovl-c1", { key: "OPS", name: "OPS", kind: "dept", headcount: 0, parentId: null });
  const role = (title: string, reportsToId: string | null) => addRole(companyId, "ovl-c1", { orgUnitId: unit, title, reportsToId, decides: [], spendLimitEur: null });
  const head = await role("Head", null);
  const owner = await role("Owner", head);
  const busy = await role("Busy", head);
  const deputy = await role("Deputy", head);
  busyRole = busy;
  await addSeat(companyId, head, "H. Head", ids["H. Head"]);
  await addSeat(companyId, owner, "A. Away", ids["A. Away"]);
  await addSeat(companyId, busy, "X. One", ids["X. One"]);
  await addSeat(companyId, busy, "Y. Two", ids["Y. Two"]);
  await addSeat(companyId, deputy, "D. Deputy", ids["D. Deputy"]);
  await saveRoute(companyId, "ovl-c1", { key: "r-owner", type: "Owner things", keywords: ["owner"], ownerRoleId: owner, deputyRoleId: deputy, buddyRoleId: null, wait: "3 d" });
  await saveRoute(companyId, "ovl-c1", { key: "r-busy", type: "Busy things", keywords: ["busy"], ownerRoleId: busy, deputyRoleId: deputy, buddyRoleId: null, wait: "3 d" });
  // Thresholds a test can reach with a few cases: four per present holder is overflow, three is up (company rule overload_at, D17). The deputy desk that
  // takes the handed cases (two for one holder) stays under up, so a second run has nothing to write.
  await saveCompanyRules(companyId, { ...DEFAULT_RULES, overloadAt: { triage: 1, up: 3, overflow: 4, late: 50 } }, "test");

  const seed = await companySeed({ id: companyId, seedJson: c.seedJson, stage: "sandbox" });
  const route = (key: string) => seed.routes.find((r) => r.type.startsWith(key))!;
  const raise = (id: string, routeKey: string, at: Date) => append("case.raised", ids["R. Raiser"], id, { kind: "idea", title: `Idea ${id}`, body: "b", routeId: route(routeKey).id, fromDept: "OPS", visibility: "everyone" }, at);
  // The desk of the only holder who is away: one open case. The busy desk: six open cases, and one raised today.
  await raise("ca", "Owner", earlier);
  for (let i = 0; i < 6; i++) await raise(`cb${i}`, "Busy", earlier);
  await raise("cnew", "Busy", now);
  await append("person.away", ids["A. Away"], null, { userId: ids["A. Away"], from: D - 1, to: D + 3, awayId: "away-1", setBy: ids["A. Away"] });
});

afterAll(async () => {
  await db.company.deleteMany({ where: { slug: SLUG } });
  await db.$disconnect();
});

it("OVL clock run writes the away and overflow hand-overs and the overloaded fact", async () => {
  expect(await run()).toBeGreaterThan(0);
  // The only holder is away: the case goes to the deputy seat, by the clock.
  const away = await handedBy("away");
  expect(away).toHaveLength(1);
  expect(away[0]).toMatchObject({ targetId: "ca", actor: "system:clock", actorUserId: null, source: "clock", payload: { to: "D. Deputy", why: "away" } });
  expect(away[0].idemKey).toBe("ovl:away:ca:away-1");
  // The busy desk reached 30 in this run: its fact, with the load numbers, and the case raised today overflows to the deputy seat; the older ones stay.
  const fact = await eventsOf("desk.overloaded");
  expect(fact).toHaveLength(1);
  expect(fact[0]).toMatchObject({ actor: "system:clock", source: "clock", payload: { level: 30, holders: 2, perHolder: 4 } });
  expect(fact[0].targetId).toBe((fact[0].payload as { roleId: string }).roleId);
  const overflow = await handedBy("overflow");
  expect(overflow.map((e) => [e.targetId, e.actor, (e.payload as { to: string }).to])).toEqual([["cnew", "system:clock", "D. Deputy"]]);
  expect(overflow[0].idemKey).toMatch(/^ovl:overflow:cnew:/);
  // Nothing else: no clock fact of OVL's kinds, no mail-like events, and the desk fact is one.
  expect((await eventsOf("clock.due")).filter((e) => ["away", "overflow", "overloaded", "cleared"].includes((e.payload as { kind: string }).kind))).toEqual([]);
});

it("OVL clock run writes nothing new on a second run", async () => {
  const before = await total();
  expect(await run()).toBe(0);
  expect(await run()).toBe(0);
  expect(await total()).toBe(before);
  expect(await handedBy("away")).toHaveLength(1);
  expect(await handedBy("overflow")).toHaveLength(1);
  expect(await eventsOf("desk.overloaded")).toHaveLength(1);
});

it("OVL clock run leaves the passes of the handed cases at 0", async () => {
  const seed = await companySeed({ id: companyId, seedJson: (await db.company.findUniqueOrThrow({ where: { id: companyId } })).seedJson, stage: "sandbox" });
  const state = reduce(seed, await loadLog(companyId, now));
  for (const id of ["ca", "cnew"]) {
    const c = state.cases.find((x) => x.id === id)!;
    expect([c.passes, c.handed.length, c.handed[0].why, c.handed[0].fromUserId]).toEqual([0, 1, id === "ca" ? "away" : "overflow", null]);
  }
  // The overflow case sits with the deputy desk now; the busy desk keeps the six it had.
  expect(state.cases.find((c) => c.id === "cnew")?.assignee).toBe("D. Deputy");
  expect(state.cases.filter((c) => c.assignee !== "D. Deputy" && c.id.startsWith("cb"))).toHaveLength(6);
});

it("OVL clock run writes desk.cleared when the desk is under 20", async () => {
  expect(await eventsOf("desk.cleared")).toHaveLength(0);
  // The busy desk closes five of its six cases: one open item for two holders is under the up level (three per holder).
  for (let i = 0; i < 5; i++) await append("case.decided", ids["X. One"], `cb${i}`, { answer: "yes", projectId: `p-${i}`, lead: "X. One", leadUserId: ids["X. One"], title: `Idea cb${i}` });
  expect(await run()).toBeGreaterThan(0);
  const cleared = await eventsOf("desk.cleared");
  expect(cleared).toHaveLength(1);
  expect(cleared[0]).toMatchObject({ actor: "system:clock", source: "clock", targetId: busyRole, payload: { roleId: busyRole } });
  expect(cleared[0].idemKey).toMatch(/^ovl:clear:/);
  // And once only.
  const before = await total();
  expect(await run()).toBe(0);
  expect(await total()).toBe(before);
});
