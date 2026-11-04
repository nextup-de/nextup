// PIL-C1: a pilot company's report week reads pilotReport (metrics, units), and the week list comes from the audit rows.
// Two small units, because with only one hidden sibling complementary suppression would hide Unit One too.
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { EMPTY_SEED } from "@/features/demo";
import { toSeedJson } from "@/features/demo/parse";
import { PILOT_METRIC_KEYS } from "@/features/metrics/types";
import { getDb } from "@/lib/db/client";
import { appendEventRow } from "@/lib/db/events";
import { pilotWeek, pilotWeekList, stageMoves } from "@/lib/db/pilot-week";
import { rebuildProjections } from "@/lib/db/projections/case-view";

const db = getDb();
const PILOT = "pil-report-pilot";
const BOX = "pil-report-box";
const NOW = new Date("2026-09-16T10:00:00+02:00");
let pilotId = "";
let boxId = "";

const stageRow = (companyId: string, at: string, before: string | null, after: string) =>
  db.auditEvent.create({
    data: { companyId, at: new Date(at), actorKind: "platform", action: "audit.company.stage", targetKind: "company", targetId: companyId, changes: { stage: { before, after } }, source: "platform" },
  });

beforeAll(async () => {
  await db.company.deleteMany({ where: { slug: { in: [PILOT, BOX] } } });
  const seedJson = toSeedJson(EMPTY_SEED) as object;
  pilotId = (await db.company.create({ data: { slug: PILOT, name: PILOT, stage: "pilot", seedJson } })).id;
  boxId = (await db.company.create({ data: { slug: BOX, name: BOX, stage: "sandbox", seedJson } })).id;
  await stageRow(pilotId, "2026-09-02T09:00:00+02:00", null, "sandbox");
  await stageRow(pilotId, "2026-09-09T09:00:00+02:00", "sandbox", "pilot");
  await stageRow(boxId, "2026-09-02T09:00:00+02:00", null, "sandbox");

  const unit = async (key: string, name: string, headcount: number, sort: number) => (await db.orgUnit.create({ data: { companyId: pilotId, key, name, headcount, sort } })).id;
  const [u1] = [await unit("U1", "Unit One", 40, 0), await unit("U2", "Unit Two", 4, 1), await unit("U3", "Unit Three", 3, 2)];
  const role = await db.orgRole.create({ data: { companyId: pilotId, orgUnitId: u1, title: "Desk", sort: 0 } });
  // Six people of Unit One raise one case each in the week of 14 Sep.
  for (const n of [1, 2, 3, 4, 5, 6]) {
    const user = await db.user.create({ data: { companyId: pilotId, name: `Pat ${n}`, email: `pat${n}@${PILOT}.example`, role: "member", active: true }, select: { id: true } });
    const seat = await db.orgRoleHolder.create({ data: { companyId: pilotId, roleId: role.id, name: `Seat ${n}`, userId: user.id, sort: n } });
    const r = await appendEventRow(
      pilotId,
      { id: crypto.randomUUID(), day: 0, type: "case.raised", actor: "Someone", targetId: `c${n}`, payload: { title: `c${n}`, body: "b", routeId: null, assignee: "Desk", assigneeRoleHolderId: seat.id, fromDept: "X", kind: "idea" } },
      { actorUserId: user.id, now: new Date("2026-09-15T10:00:00+02:00") },
    );
    expect(r).toEqual({ ok: true, duplicate: false });
  }
  await rebuildProjections(pilotId);
}, 60_000);

afterAll(async () => {
  await db.company.deleteMany({ where: { slug: { in: [PILOT, BOX] } } });
  await db.$disconnect();
});

describe("PIL report", () => {
  it("reads the stage moves from the audit rows, oldest first", async () => {
    expect((await stageMoves(pilotId)).map((m) => m.after)).toEqual(["sandbox", "pilot"]);
  });

  it("reads a pilot company's week with the metrics and units of pilotReport, small units hidden, in tree order", async () => {
    const list = await pilotWeekList(pilotId, NOW);
    expect(list.state).toBe("running");
    expect(list.weeks.map((w) => w.monday)).toEqual(["2026-09-07", "2026-09-14"]);
    const week = await pilotWeek(pilotId, "2026-09-14", NOW);
    expect(week).not.toBeNull();
    expect(week!.week.pilotWeek).toBe(2);
    expect(week!.report.metrics.map((m) => m.key)).toEqual([...PILOT_METRIC_KEYS]);
    // 47 people in scope, 6 cases.
    expect(week!.report.metrics.find((m) => m.key === "casesPer10")).toMatchObject({ value: 1.3, hidden: false });
    expect(week!.report.zi.units.map((u) => [u.label, u.hidden])).toEqual([["Unit One", false], ["Unit Two", true], ["Unit Three", true]]);
    expect(await pilotWeek(pilotId, "2026-09-21", NOW)).toBeNull();
  });

  it("gives a sandbox company no report weeks yet", async () => {
    expect(await pilotWeekList(boxId, NOW)).toEqual({ state: "before", weeks: [], pausedSince: null });
    expect(await pilotWeek(boxId, "2026-09-14", NOW)).toBeNull();
  });
});
