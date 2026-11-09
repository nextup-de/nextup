// MET-Z1: the dashboard numbers equal a hand-computed fixture (MET D22). A workdays-mode company (CLK calendar, stage
// pilot) with three units of 7, 6 and 3 seat holders; 21 cases written as events on fixed working days, then
// rebuildProjections. The expected values are literals, each with its arithmetic beside it; nothing is computed from the code
// under test. "Today" is pinned to working day 19 (Fri 2026-10-02) by faking Date only.
//
// Working days (D0 = Mon 2026-09-07): baseline period D0+0..D0+9, current period D0+10..D0+19, promise 5 days.
import { afterAll, beforeAll, describe, expect, it, vi } from "vitest";
import type { Viewer } from "@/features/auth/session";
import type { CaseEventType, EventPayload } from "@/features/cases/events";
import { DEFAULT_CALENDAR } from "@/features/clock";
import { workdayOf } from "@/features/clock/calendar";
import { EMPTY_SEED } from "@/features/demo";
import { toSeedJson } from "@/features/demo/parse";
import { getDb } from "@/lib/db/client";
import { saveBaseline } from "@/lib/db/baseline";
import { appendEventRow } from "@/lib/db/events";
import { dashboardData } from "@/lib/db/metrics";
import { pilotReport } from "@/lib/db/pilot-report";
import { rebuildProjections } from "@/lib/db/projections/case-view";
import { recordAudit } from "@/server/audit/record";

let viewer: Viewer | null = null;
vi.mock("@/features/auth/session", () => ({ getViewerFor: vi.fn(async (slug: string) => (viewer && viewer.companySlug === slug ? viewer : null)) }));
vi.mock("next/cache", () => ({ revalidatePath: vi.fn() }));

import { exportDashboardCsvAction } from "@/server/actions/metrics";

const db = getDb();
const SLUG = "met-acceptance";

// Offset n is the n-th working day after Monday 2026-09-07 (no public holiday in the range).
const D0 = workdayOf(new Date("2026-09-07T10:00:00Z"), DEFAULT_CALENDAR);
const DATES: string[] = [];
for (let t = Date.UTC(2026, 8, 7); DATES.length < 25; t += 86_400_000) {
  const wd = new Date(t).getUTCDay();
  if (wd !== 0 && wd !== 6) DATES.push(new Date(t).toISOString().slice(0, 10));
}
const at = (n: number) => new Date(`${DATES[n]}T10:00:00Z`);
const TODAY = 19;
const CURRENT = { from: D0 + 10, to: D0 + TODAY };

let companyId = "";
let manager = "";
const users: Record<string, string> = {};
const seats: Record<string, string> = {};
const roleOf: Record<string, string> = {};

async function add(type: CaseEventType, target: string, n: number, payload: EventPayload = {}, by: string | null = null) {
  const r = await appendEventRow(companyId, { id: crypto.randomUUID(), day: 0, type, actor: "Someone", targetId: target, payload }, { actorUserId: by, now: at(n) });
  expect(r).toEqual({ ok: true, duplicate: false });
}
const raise = (id: string, n: number, route: "r-u1" | "r-u2" | "r-u3", by: string, extra: EventPayload = {}) =>
  add("case.raised", id, n, { title: id, body: "b", routeId: route, assignee: "Desk", assigneeRoleHolderId: seats[by], fromDept: "X", kind: "problem", ...extra }, users[by]);
const decide = (id: string, n: number, payload: EventPayload) => add("case.decided", id, n, payload, manager);

beforeAll(async () => {
  vi.useFakeTimers({ toFake: ["Date"] });
  vi.setSystemTime(at(TODAY));
  expect(workdayOf(at(TODAY), DEFAULT_CALENDAR)).toBe(D0 + TODAY);
  await db.company.deleteMany({ where: { slug: SLUG } });
  const c = await db.company.create({ data: { slug: SLUG, name: SLUG, stage: "pilot", seedJson: toSeedJson(EMPTY_SEED) as object } });
  companyId = c.id;
  manager = (await db.user.create({ data: { companyId, name: "Mara Boss", email: "mara@met-acceptance.example", role: "manager" }, select: { id: true } })).id;
  const unit = async (key: string, name: string, headcount: number, sort: number) => (await db.orgUnit.create({ data: { companyId, key, name, headcount, sort } })).id;
  const [u1, u2, u3] = [await unit("U1", "Assembly", 7, 0), await unit("U2", "Logistics", 6, 1), await unit("U3", "Quality", 3, 2)];
  const role = async (unitId: string, title: string, sort: number) => (await db.orgRole.create({ data: { companyId, orgUnitId: unitId, title, sort } })).id;
  const [r1, r2, r3] = [await role(u1, "Desk Assembly", 0), await role(u2, "Desk Logistics", 1), await role(u3, "Desk Quality", 2)];
  let sort = 0;
  const seat = async (key: string, roleId: string) => {
    users[key] = (await db.user.create({ data: { companyId, name: `Person ${key}`, email: `${key}@met-acceptance.example`, role: "member", active: true }, select: { id: true } })).id;
    seats[key] = (await db.orgRoleHolder.create({ data: { companyId, roleId, name: `Seat ${key}`, userId: users[key], sort: sort++ } })).id;
    roleOf[key] = roleId;
  };
  for (const k of ["a1", "a2", "a3", "a4", "a5", "a6", "a7"]) await seat(k, r1); // 7 people
  for (const k of ["b1", "b2", "b3", "b4", "b5", "b6"]) await seat(k, r2); // 6 people
  for (const k of ["c1", "c2", "c3"]) await seat(k, r3); // 3 people
  await db.routingRule.create({ data: { companyId, key: "r-u1", type: "Q1", keywords: ["one"], ownerRoleId: r1, sort: 0 } });
  await db.routingRule.create({ data: { companyId, key: "r-u2", type: "Q2", keywords: ["two"], ownerRoleId: r2, sort: 1 } });
  await db.routingRule.create({ data: { companyId, key: "r-u3", type: "Q3", keywords: ["three"], ownerRoleId: r3, sort: 2 } });

  // Baseline period (offsets 0..9)
  await raise("B1", 0, "r-u1", "a1");
  await decide("B1", 2, { answer: "yes", reason: "ok" });
  await raise("B2", 1, "r-u1", "a2", { kind: "idea" });
  await add("case.asked", "B2", 2, { text: "q" }, manager);
  await decide("B2", 5, { answer: "yes", reason: "go", projectId: "p-b2", lead: "Someone" });
  await raise("B3", 2, "r-u2", "b1");
  await decide("B3", 9, { answer: "no", reason: "not now" });
  await raise("B4", 3, "r-u2", "b2");
  await add("case.handed", "B4", 4, { to: "x", toRoleHolderId: seats.b3, why: "away" }, manager);
  await raise("B5", 4, "r-u1", "a3");
  await decide("B5", 5, { answer: "yes", reason: "ok" });
  await raise("B6", 6, "r-u3", "c1");
  await add("case.asked", "B6", 7, { text: "q" }, manager);
  await raise("B7", 7, "r-u2", "b3");
  await decide("B7", 8, { answer: "no" });
  await raise("B8", 8, "r-u1", "a4");
  await add("clock.due", "B8", 9, { kind: "deadline", dueDay: D0 + 13, toRoleHolderId: seats.a2 });

  // Current period (offsets 10..19)
  await raise("N1", 10, "r-u1", "a1", { kind: "idea" });
  await decide("N1", 12, { answer: "yes", reason: "go", projectId: "p-n1", lead: "Someone" });
  await raise("N2", 10, "r-u1", "a2");
  await decide("N2", 11, { answer: "yes", reason: "ok" });
  await raise("N3", 11, "r-u2", "b1", { kind: "idea" });
  await add("case.asked", "N3", 12, { text: "q" }, manager);
  await decide("N3", 17, { answer: "yes", reason: "ok" });
  await raise("N4", 11, "r-u2", "b2");
  await add("case.handed", "N4", 13, { to: "x", toRoleHolderId: seats.b3, why: "away" }, manager);
  await decide("N4", 19, { answer: "yes", reason: "ok" });
  await raise("N5", 12, "r-u1", "a3");
  await decide("N5", 14, { answer: "no", reason: "not now" });
  await raise("N6", 12, "r-u3", "c2");
  await decide("N6", 13, { answer: "yes", reason: "ok" });
  await raise("N7", 13, "r-u1", "a5");
  await add("clock.due", "N7", 18, { kind: "deadline", dueDay: D0 + 18, toRoleHolderId: seats.a2 });
  await raise("N8", 14, "r-u2", "b4");
  const proposal = (routeId: string) => ({ routeId, confidence: 80, source: "keywords" as const, version: "t" });
  await raise("N9", 15, "r-u1", "a6", { proposal: proposal("r-u2") });
  await add("case.override", "N9", 15, { proposed: "r-u2", chosen: "r-u1" }, users.a6);
  await decide("N9", 16, { answer: "yes", reason: "ok" });
  await raise("N10", 16, "r-u1", "a3", { proposal: proposal("r-u1") }); // a3 raises again after the reasoned No of N5
  await raise("N11", 17, "r-u1", "a7");
  await add("case.asked", "N11", 18, { text: "q" }, manager);
  await raise("N12", 18, "r-u2", "b5");
  await raise("N13", 19, "r-u3", "c3");
  await rebuildProjections(companyId);
  await saveBaseline(companyId, { fromDay: D0, toDay: D0 + 9, fromDate: null, toDate: null, imported: {} }, manager, recordAudit);
}, 120_000);

afterAll(async () => {
  vi.useRealTimers();
  await db.company.deleteMany({ where: { slug: SLUG } });
  await db.$disconnect();
});

const input = { unitId: null, kind: "golive" as const };
const six = (x: number) => [0, 0, 0, 0, 0, x];

describe("MET acceptance: dashboard numbers match the fixture", () => {
  it("gives the six tiles, stages, answers and trend of the company", async () => {
    const data = await dashboardData(companyId, input);
    expect(data.period).toEqual(CURRENT);
    expect(data.baseline).toMatchObject({ fromDay: D0, toDay: D0 + 9 });
    expect(data.caseCount).toBe(13); // N1..N13
    expect(data.scopeHidden).toBe(false);
    expect(data.tiles).toEqual([
      // reasoned waits N1 2, N2 1, N3 6, N4 8, N5 2, N6 1, N9 1 -> sorted 1,1,1,2,2,6,8 -> median 2 of 7.
      // baseline: B1 2, B2 4, B3 7, B5 1 -> 1,2,4,7 -> 3. Month: all 11 waits 1,1,1,1,2,2,2,4,6,7,8 -> median 2.
      { id: "firstReasonedAnswer", value: 2, of: 7, baseline: 3, months: six(2), hidden: false },
      // on time: ok N1,N2,N3,N5,N6,N9,N11 = 7; judged = 7 + N4 (answered day 8) + N7 (open, 6 > 5) = 9; N8 (5), N10, N12, N13 left out. 7/9 = 77.8 -> 78.
      // baseline: ok B1,B2,B5,B6,B7 = 5 of 8 (B3 7 days, B4 and B8 open and late) = 62.5 -> 63. Month: 12/17 = 70.6 -> 71.
      { id: "onTime", value: 78, of: 9, baseline: 63, months: six(71), hidden: false },
      // ideas decided: N1 wait 2, N3 wait 6 -> median 4 of 2. Baseline: B2 wait 4. Month: 2,4,6 -> 4.
      { id: "ideaToDecision", value: 4, of: 2, baseline: 4, months: six(4), hidden: false },
      // open now: B4, B8, N7, N8, N10, N12, N13 = 7; past promise (due < 19): B4 due 8, B8 due 13, N7 due 18 = 3. No baseline (period ends before today).
      { id: "pastPromise", value: 3, of: 7, baseline: null, months: six(3), hidden: false },
      // escalated in the period: N7 (day 18) = 1; baseline: B8 (day 9) = 1. Month: B8 and N7 = 2.
      { id: "escalated", value: 1, of: null, baseline: 1, months: six(2), hidden: false },
      // proposals N9 (overridden) and N10 (kept) -> 1 of 2 = 50. No proposals in the baseline.
      { id: "overruled", value: 50, of: 2, baseline: null, months: six(0), hidden: false },
    ]);
    // Open cases are all "open": ages today - last event day: B4 15, B8 10, N7 1, N8 5, N10 3, N12 1, N13 0 = 35 / 7 = 5.
    expect(data.stages).toEqual([{ status: "open", open: 7, avgDays: 5 }]);
    // Decisions in the period: yes N2 N3 N4 N6 N9 = 5, yes with project N1 = 1, no N5 = 1; questions N3 N11 = 2; hand-overs N4 = 1.
    expect(data.answers).toEqual({ yes: 5, yesProject: 1, question: 2, handed: 1, no: 1 });
    // Last bucket ends today and holds both periods: 8 + 13 = 21 raised, answered 6 (B1 B2 B3 B5 B6 B7) + 8 (N1 N2 N3 N4 N5 N6 N9 N11) = 14, on time 5 + 7 = 12.
    expect(data.trend).toHaveLength(6);
    // It ends on D0+19, Friday 2 Oct 2026: the axis names it by that month ("Oct").
    expect(data.trend[5]).toEqual({ month: String(D0 - 10), endDay: D0 + 19, endDate: "2026-10-02", raised: 21, answered: 14, onTime: 12, baseline: true });
  });

  it("hides every tile for a unit under 5 people", async () => {
    const unit = (await db.orgUnit.findFirstOrThrow({ where: { companyId, key: "U3" }, select: { id: true } })).id;
    const data = await dashboardData(companyId, { unitId: unit, kind: "golive" });
    expect(data.scopeHidden).toBe(true);
    expect(data.tiles.every((t) => t.hidden && t.value === null && t.baseline === null)).toBe(true);
    expect(data.caseCount).toBe(0);
  });

  it("gives the unit and role breakdown with the 3-person unit hidden", async () => {
    const data = await dashboardData(companyId, input);
    const hiddenRow = { cases: null, firstReasonedAnswer: null, onTimePct: null, pastPromise: null, escalated: null, hidden: true };
    const pick = (rows: typeof data.units) => rows.map(({ id: _id, ...rest }) => rest);
    // Assembly (7 people): 7 cases raised (N1 N2 N5 N7 N9 N10 N11); reasoned waits 2,1,2,1 -> 1.5;
    // on time N1 N2 N5 N9 N11 = 5 of 6 (N7 late, N10 left out) = 83; open past promise B8 and N7 = 2; escalated N7 = 1.
    // Quality (3 people) is hidden; its only sibling that stays visible would let a viewer subtract it, so Logistics (6, the smaller) is hidden too.
    expect(pick(data.units)).toEqual([
      { kind: "unit", label: "Assembly", depth: 0, cases: 7, firstReasonedAnswer: 1.5, onTimePct: 83, pastPromise: 2, escalated: 1, hidden: false },
      { kind: "unit", label: "Logistics", depth: 0, ...hiddenRow },
      { kind: "unit", label: "Quality", depth: 0, ...hiddenRow },
    ]);
    // Desk Assembly (7): the same seven cases. Desk Logistics (6): N3 N4 N8 N12 = 4 cases; reasoned 6 and 8 -> 7;
    // on time N3 ok, N4 late, N8 and N12 left out = 1 of 2 = 50; open past promise B4 = 1; escalated 0. Desk Quality (3) is hidden.
    expect(pick(data.roles)).toEqual([
      { kind: "role", label: "Desk Assembly", depth: 0, cases: 7, firstReasonedAnswer: 1.5, onTimePct: 83, pastPromise: 2, escalated: 1, hidden: false },
      { kind: "role", label: "Desk Logistics", depth: 0, cases: 4, firstReasonedAnswer: 7, onTimePct: 50, pastPromise: 1, escalated: 0, hidden: false },
      { kind: "role", label: "Desk Quality", depth: 0, ...hiddenRow },
    ]);
  });

  it("exports the same rows as CSV lines", async () => {
    viewer = { userId: manager, companyId, companySlug: SLUG, name: "n", handle: null, role: "manager", epoch: 0, issuedAt: 0 };
    const units = await exportDashboardCsvAction(SLUG, input, "unit");
    const roles = await exportDashboardCsvAction(SLUG, input, "role");
    if ("error" in units || "error" in roles) throw new Error("forbidden");
    const few = "too few";
    const header = "Unit or role;Cases;First reasoned answer (days, median);On time (%);Open cases past promise;Escalated";
    expect(units.body).toBe([header, "Assembly;7;1.5;83;2;1", `Logistics;${Array(5).fill(few).join(";")}`, `Quality;${Array(5).fill(few).join(";")}`, ""].join("\n"));
    expect(roles.body).toBe([header, "Desk Assembly;7;1.5;83;2;1", "Desk Logistics;4;7;50;1;0", `Desk Quality;${Array(5).fill(few).join(";")}`, ""].join("\n"));
    expect(units.name).toBe("units-met-acceptance-2026-09-21-2026-10-02.csv"); // DATES[10] .. DATES[19]
  });

  it("gives the pilot report values", async () => {
    const report = await pilotReport(companyId, CURRENT.from, CURRENT.to);
    const m = new Map(report.metrics.map((x) => [x.key, x]));
    const pick = (k: string) => {
      const x = m.get(k as never)!;
      return { value: x.value, baseline: x.baseline, hidden: x.hidden, note: x.note };
    };
    // Median wait 2 days (as the tile); baseline 3.
    expect(pick("firstReasonedAnswer")).toEqual({ value: 2, baseline: 3, hidden: false, note: null });
    // 7 of 9 = 78; baseline 5 of 8 = 63.
    expect(pick("withinPromisePct")).toEqual({ value: 78, baseline: 63, hidden: false, note: null });
    // 1 hand-over out of 10 answers (5 + 1 + 2 + 1 + 1) = 10; baseline 1 of 8 (yes 2, yes project 1, no 2, questions 2, hand-over 1) = 12.5 -> 13.
    expect(pick("deputyHandoverPct")).toEqual({ value: 10, baseline: 13, hidden: false, note: null });
    // 12 distinct raisers (a1 a2 a3 a5 a6 a7, b1 b2 b4 b5, c2 c3) of 16 configured people = 75; baseline 8 raisers (a1 a2 a3 a4 b1 b2 b3 c1) of 16 = 50.
    expect(pick("participationPct")).toEqual({ value: 75, baseline: 50, hidden: false, note: null });
    // 1 overridden of 2 proposals = 50; no proposals in the baseline.
    expect(pick("overrideRatePct")).toEqual({ value: 50, baseline: null, hidden: false, note: null });
    // Only one person (a3) got a reasoned No in the period and raised again: under 5 people, so the share is hidden.
    expect(pick("resubmissionAfterNoPct")).toEqual({ value: null, baseline: null, hidden: true, note: "too-few" });
    expect(report.baseline).toMatchObject({ fromDay: D0, toDay: D0 + 9, source: "counted" });
  });
});
