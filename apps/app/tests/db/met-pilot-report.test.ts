// MET-K1: pilotReport(companyId, from, to) and the KPI loader on events written through appendEventRow.
// Unit One has 40 people and 6 raisers; Units Two and Three are small. Two small units, because with only one
// hidden sibling complementary suppression (D6) would hide Unit One too.
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import type { CaseEventType, EventPayload } from "@/features/cases/events";
import { DEFAULT_CALENDAR } from "@/features/clock";
import { workdayOf } from "@/features/clock/calendar";
import { toSeedJson } from "@/features/demo/parse";
import { EMPTY_SEED } from "@/features/demo";
import { PILOT_METRIC_KEYS } from "@/features/metrics/types";
import { getDb } from "@/lib/db/client";
import { appendEventRow } from "@/lib/db/events";
import { rebuildProjections } from "@/lib/db/projections/case-view";
import { kpisData, pilotReport } from "@/lib/db/pilot-report";

const db = getDb();
const SLUG = "met-pilot-report";

// Monday 2026-09-07 is working day D0; offset n is the n-th working day after it.
const D0 = workdayOf(new Date("2026-09-07T10:00:00Z"), DEFAULT_CALENDAR);
const dates = ["07", "08", "09", "10", "11", "14", "15", "16", "17", "18", "21", "22"].map((d) => `2026-09-${d}`);
const at = (n: number) => new Date(`${dates[n]}T10:00:00Z`);

let companyId = "";
let manager = "";
const users: Record<string, string> = {};
const seats: Record<string, string> = {};
const secrets: string[] = [];

async function add(type: CaseEventType, target: string, n: number, payload: EventPayload = {}, by: string | null = null) {
  const r = await appendEventRow(companyId, { id: crypto.randomUUID(), day: 0, type, actor: "Someone", targetId: target, payload }, { actorUserId: by, now: at(n) });
  expect(r).toEqual({ ok: true, duplicate: false });
}
const raise = (id: string, n: number, by: string) =>
  add("case.raised", id, n, { title: id, body: "b", routeId: null, assignee: "Desk", assigneeRoleHolderId: seats[by], fromDept: "X", kind: "idea" }, users[by]);
const decide = (id: string, n: number, payload: EventPayload) => add("case.decided", id, n, { reason: "because", ...payload }, manager);
const project = async (pid: string, caseId: string, n: number, doneAt: number | null) => {
  await decide(caseId, n, { answer: "yes", projectId: pid, lead: "Someone" });
  await add("project.baseline", pid, n, { metric: "Changeover", unit: "min", value: 42, better: "down", source: "MES" }, manager);
  if (doneAt === null) return;
  await add("project.started", pid, n, {}, manager);
  await add("project.done", pid, doneAt, { note: "live" }, manager);
};
const importSource = { kind: "import" as const, file: "kpi.csv", sha256: "a".repeat(64), rows: 1 };

beforeAll(async () => {
  await db.company.deleteMany({ where: { slug: SLUG } });
  const c = await db.company.create({ data: { slug: SLUG, name: SLUG, stage: "pilot", seedJson: toSeedJson(EMPTY_SEED) as object } });
  companyId = c.id;
  const mk = async (name: string, role: string, handle: string | null = null) => {
    secrets.push(name);
    if (handle) secrets.push(handle);
    const u = await db.user.create({ data: { companyId, name, email: `${name.replace(/\W+/g, "")}@${SLUG}.example`, role, active: true, handle }, select: { id: true } });
    secrets.push(u.id);
    return u.id;
  };
  manager = await mk("Mara Boss", "manager");
  const unit = async (key: string, name: string, headcount: number, sort: number) =>
    (await db.orgUnit.create({ data: { companyId, key, name, headcount, sort } })).id;
  const [u1, u2, u3] = [await unit("U1", "Unit One", 40, 0), await unit("U2", "Unit Two", 4, 1), await unit("U3", "Unit Three", 3, 2)];
  const role = async (unitId: string, title: string, sort: number) => (await db.orgRole.create({ data: { companyId, orgUnitId: unitId, title, sort } })).id;
  const roles = [await role(u1, "Desk One", 0), await role(u2, "Desk Two", 1), await role(u3, "Desk Three", 2)];
  let sort = 0;
  const seat = async (key: string, roleId: string) => {
    users[key] = await mk(`Person ${key}`, "member", `Anonymous #${key}`);
    seats[key] = (await db.orgRoleHolder.create({ data: { companyId, roleId, name: `Seat ${key}`, userId: users[key], sort: sort++ } })).id;
  };
  for (const k of ["a1", "a2", "a3", "a4", "a5", "a6"]) await seat(k, roles[0]);
  for (const k of ["b1", "b2"]) await seat(k, roles[1]);
  await seat("c1", roles[2]);

  // Seven ideas from six people of Unit One; i7 is a1..a6's a4 raising again after a reasoned No.
  await raise("i1", 0, "a1");
  await raise("i2", 0, "a2");
  await raise("i3", 1, "a3");
  await raise("i4", 1, "a4");
  await raise("i5", 2, "a5");
  await raise("i6", 2, "a6");
  await decide("i4", 5, { answer: "no", reason: "not now" });
  await raise("i7", 6, "a4");
  // p1: finished, a confirmed better measure (money, kWh, CO2), a reward. p2: an unconfirmed typed measure.
  // p3: a confirmed worse measure. p4: decided, never started.
  await project("p1", "i1", 2, 6);
  await add("project.measured", "p1", 7, { check: 30, value: 30, source: importSource, impact: { savingEurPerYear: 10000, energyKwhPerYear: 5000, co2KgPerYear: 2000 } }, manager);
  await add("project.measure.confirmed", "p1", 8, { check: 30 }, users.a1);
  await add("project.rewarded", "p1", 9, { rule: "fixed", amount: 500 }, manager);
  await project("p2", "i2", 3, 7);
  await add("project.measured", "p2", 8, { check: 30, value: 30, source: { kind: "typed" }, impact: { savingEurPerYear: 7000, energyKwhPerYear: 900 } }, manager);
  await project("p3", "i3", 4, 8);
  await add("project.measured", "p3", 9, { check: 30, value: 60, source: importSource, impact: { savingEurPerYear: 3000 } }, manager);
  await add("project.measure.confirmed", "p3", 9, { check: 30 }, users.a2);
  await project("p4", "i5", 5, null);
  await rebuildProjections(companyId);

  // A baseline of ten working days before D0, with one imported key.
  await db.companyRule.create({
    data: {
      companyId,
      key: "metrics_baseline",
      value: {
        fromDay: D0 - 10, toDay: D0 - 1, fromDate: null, toDate: null,
        imported: { participationPct: { value: 10, source: "ERP export", sha256: "b".repeat(64), importedBy: manager, importedAt: "2026-09-01T08:00:00.000Z" } },
      },
    },
  });
}, 60_000);

afterAll(async () => {
  await db.company.deleteMany({ where: { slug: SLUG } });
  await db.$disconnect();
});

describe("MET pilot report", () => {
  it("returns every pilot metric with its baseline and the hand-computed values", async () => {
    const report = await pilotReport(companyId, D0, D0 + 20);
    expect(report.metrics.map((m) => m.key)).toEqual([...PILOT_METRIC_KEYS]);
    const m = new Map(report.metrics.map((x) => [x.key, x]));
    // 47 people in scope (40 + 4 + 3, customer-supplied), 6 raisers, 7 ideas.
    expect(m.get("participationPct")).toMatchObject({ value: 13, baseline: 10, hidden: false });
    expect(m.get("casesPer10")).toMatchObject({ value: 1.5, hidden: false });
    // Of the four projects decided in the period three were finished.
    expect(m.get("implementationPct")?.value).toBe(75);
    // Only p1 is confirmed and better: p2 is unconfirmed, p3 is worse.
    expect(m.get("verifiedOutcomes")?.value).toBe(1);
    expect(m.get("verifiedSavingsEur")?.value).toBe(10000);
    expect(m.get("verifiedEnergyKwh")?.value).toBe(5000);
    expect(m.get("verifiedCo2Kg")?.value).toBe(2000);
    // One person got a reasoned No: fewer than 5, so the share is hidden.
    expect(m.get("resubmissionAfterNoPct")).toMatchObject({ value: null, hidden: true, note: "too-few" });
    expect(m.get("shopFloorPct")?.note).toBe("not-recorded");
    expect(report.period).toEqual({ from: D0, to: D0 + 20 });
    expect(report.fromDate).toBe("2026-09-07");
    expect(report.companyId).toBe(companyId);
  });

  it("gives the ZI rows with the small units hidden and counts only the verified better measure", async () => {
    const { zi } = await pilotReport(companyId, D0, D0 + 20);
    expect(zi.company).toMatchObject({
      hidden: false, headcount: 47, participationPct: 13, ideasPer100: 14.9, implementationPct: 75, medianDaysToDecision: 3,
      savingsEur: 10000, energyKwh: 5000, co2Kg: 2000, premiumsEur: 500,
    });
    const byLabel = new Map(zi.units.map((u) => [u.label, u]));
    expect(byLabel.get("Unit One")).toMatchObject({
      hidden: false, headcount: 40, participationPct: 15, ideasPer100: 17.5, implementationPct: 75, medianDaysToDecision: 3,
      savingsEur: 10000, energyKwh: 5000, co2Kg: 2000, premiumsEur: 500,
    });
    for (const name of ["Unit Two", "Unit Three"]) {
      expect(byLabel.get(name)).toMatchObject({
        hidden: true, headcount: 0, participationPct: null, ideasPer100: null, implementationPct: null, medianDaysToDecision: null,
        savingsEur: null, energyKwh: null, co2Kg: null, premiumsEur: null,
      });
    }
  });

  it("lets the imported baseline win and reports a mixed source", async () => {
    const report = await pilotReport(companyId, D0, D0 + 20);
    expect(report.baseline).toMatchObject({ fromDay: D0 - 10, toDay: D0 - 1, source: "mixed" });
    expect(report.baseline?.imported.participationPct).toMatchObject({ value: 10, source: "ERP export", importedAt: "2026-09-01T08:00:00.000Z" });
    // Counted baseline values are used for every key that was not imported.
    expect(report.metrics.find((x) => x.key === "casesPer10")?.baseline).toBe(0);
  });

  it("holds no user id, name, handle or importer id", async () => {
    const report = await pilotReport(companyId, D0, D0 + 20);
    const text = JSON.stringify(report);
    for (const secret of secrets) expect(text).not.toContain(secret);
    expect(text).not.toContain(manager);
    expect(report.baseline?.imported.participationPct).not.toHaveProperty("importedBy", manager);
  });

  it("loads the KPI report for a fixed period", async () => {
    const data = await kpisData(companyId, "golive");
    expect(data.available).toBe(true);
    expect(data.period.from).toBe(D0);
    expect(data.baselineSource).toBe("mixed");
    expect(data.projectsOn).toBe(true);
    expect(data.headcountConfigured).toBe(true);
    expect(JSON.stringify(data)).not.toContain(manager);
  });
});
