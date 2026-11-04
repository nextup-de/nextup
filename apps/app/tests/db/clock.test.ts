// CLK acceptance against a real Postgres (CLK-Z1): a case raised on the Friday before a holiday falls due on the
// right working day, reaches the deputy's desk once, and stays at one fact across a scheduler restart.
// Every date below is written out; nothing is derived with the code under test.
import { afterAll, beforeAll, describe, expect, it, vi } from "vitest";
import { templateWrites } from "@/features/demo/content";
import { toSeedJson } from "@/features/demo/parse";
import { reduce } from "@/features/cases/reducer";
import { onDeskOf } from "@/features/cases/selectors";
import { meOfSeat } from "@/features/auth/identity";
import { DEFAULT_CALENDAR } from "@/features/clock";
import { getDb } from "@/lib/db/client";
import { saveCalendar } from "@/lib/db/calendar";
import { companySeed } from "@/lib/db/companies";
import { bindDemoCompany } from "@/lib/db/demo-identity";
import { peopleForSeats } from "./test-company";
import { appendEventRow, loadLog } from "@/lib/db/events";
import { writeStructure } from "@/lib/db/structure-writes";

const db = getDb();
const CASE = "clkz-case";
const raisedAt = new Date("2026-05-22T10:00:00+02:00"); // Friday; Whit Monday 25 May is a holiday in DE-BY
let company: { id: string; seedJson: unknown; stage: string };

/** 09:00 Berlin (CEST, +02:00) on each listed day. */
const at9 = (day: string): Date => new Date(`${day}T09:00:00+02:00`);

const MAY_22_TO_31 = ["22", "23", "24", "25", "26", "27", "28", "29", "30", "31"].map((d) => `2026-05-${d}`);
const JUN = (from: number, to: number): string[] => Array.from({ length: to - from + 1 }, (_, i) => `2026-06-${String(from + i).padStart(2, "0")}`);
const UNTIL_JUN_12 = [...MAY_22_TO_31, ...JUN(1, 12)];
const JUN_13_TO_19 = JUN(13, 19);

const facts = () => db.caseEvent.findMany({ where: { companyId: company.id, type: "clock.due", targetId: CASE } });
const reduced = async (now: Date) => {
  const state = reduce(await companySeed(company), await loadLog(company.id, now));
  return { state, c: state.cases.find((x) => x.id === CASE)! };
};

beforeAll(async () => {
  await db.company.deleteMany({});
  const writes = templateWrites("demo", () => crypto.randomUUID());
  const person = (name: string, role: string) => ({ name, email: name.replace(/\W+/g, "").toLowerCase() + "@clkz.example", role, dept: "", ini: "XX", handle: null });
  const c = await db.company.create({
    data: { slug: "clkz-box", name: "clkz-box", stage: "sandbox", seedJson: toSeedJson(writes.seedJson) as object, users: { create: [person("B. Hartmann", "manager"), person("T. Vogel", "leader"), person("J. Schmidt", "member")] } },
  });
  await writeStructure(c.id, writes, "test");
  await peopleForSeats(c.id, "clkz");
  await bindDemoCompany(c.id);
  await saveCalendar(c.id, { ...DEFAULT_CALENDAR, region: "DE-BY" }, "test");
  company = { id: c.id, seedJson: c.seedJson, stage: "sandbox" };
  await appendEventRow(c.id, { id: "clkz-raised", day: 0, type: "case.raised", actor: "J. Schmidt", targetId: CASE, payload: { title: "Late", routeId: "r1" } } as never, { now: raisedAt });
});

afterAll(async () => {
  await db.company.deleteMany({});
  await db.$disconnect();
});

describe("CLK acceptance: deadline hands to the deputy once on the right working day", () => {
  it("writes no deadline fact before Tuesday 2 June and exactly one on that run", async () => {
    const { runClockOnce } = await import("@/server/scheduler/clock");
    const seed = await companySeed(company);
    const route = seed.routes.find((r) => r.id === "r1")!;
    expect(route.deputyRoleId).toBeTruthy();

    for (const day of UNTIL_JUN_12) {
      await runClockOnce(at9(day));
      const n = (await facts()).length;
      expect({ day, n }).toEqual({ day, n: day < "2026-06-02" ? 0 : 1 });

      if (day === "2026-06-01") {
        const { c } = await reduced(at9(day));
        expect(c.escalated).toBeNull();
      }
      if (day === "2026-06-02") {
        const { state, c } = await reduced(at9(day));
        const f = (await facts())[0];
        expect(f.payload).toMatchObject({ kind: "deadline", dueDay: c.dueDay });
        expect(c.escalated).not.toBeNull();
        expect(c.escalated!.toRoleId).toBe(route.deputyRoleId);
        const deputySeat = state.seats.find((s) => s.id === c.escalated!.toSeatId)!;
        expect(deputySeat.roleId).toBe(route.deputyRoleId);
        expect(onDeskOf(c, meOfSeat(deputySeat.id, state.seats))).toBe(true);
        expect(onDeskOf(c, meOfSeat(route.ownerSeatId!, state.seats))).toBe(true);
      }
    }
  });

  it("still holds exactly one fact after a restart of the scheduler", async () => {
    vi.resetModules();
    const { runClockOnce } = await import("@/server/scheduler/clock");
    for (const day of [...JUN(2, 12), ...JUN_13_TO_19]) await runClockOnce(at9(day));
    expect(await facts()).toHaveLength(1);
    const { c } = await reduced(at9("2026-06-19"));
    // LOOP-R1: the scheduler has handed the case to the deputy seat by now, which ends the escalation.
    expect(c.escalated).toBeNull();
    expect(c.assigneeRoleId).toBe(c.route?.deputyRoleId);
  });
});
