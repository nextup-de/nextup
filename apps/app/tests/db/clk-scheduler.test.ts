// The clock scheduler against a real Postgres (CLK-D1, D13): each due fact once, under a per-company lease.
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { workdayOf } from "@/features/clock/calendar";
import { DEFAULT_CALENDAR } from "@/features/clock";
import { getDb } from "@/lib/db/client";
import { runClockOnce } from "@/server/scheduler/clock";
import { company, facts, now } from "./clk-company";

const db = getDb();
let box: { id: string };
let demo: { id: string };
let held: { id: string };

beforeAll(async () => {
  await db.company.deleteMany({});
  box = await company("clks-box", "sandbox");
  demo = await company("clks-demo", "demo", workdayOf(now, DEFAULT_CALENDAR));
  held = await company("clks-held", "sandbox");
  await db.clockLease.create({ data: { companyId: held.id, leaseUntil: new Date(now.getTime() + 3 * 60_000) } });
});

afterAll(async () => {
  await db.company.deleteMany({});
  await db.$disconnect();
});

describe("CLK scheduler", () => {
  it("writes one fact when two runs go at once", async () => {
    await db.caseEvent.deleteMany({ where: { companyId: box.id, type: "clock.due" } });
    await Promise.all([runClockOnce(now), runClockOnce(now)]);
    expect(await facts(box.id, "clks-box-case")).toHaveLength(1);
  });

  it("leaves a demo company alone", async () => {
    const ran = await runClockOnce(now);
    expect(ran.some((r) => r.slug === "clks-demo")).toBe(false);
    expect(await db.caseEvent.count({ where: { companyId: demo.id, type: "clock.due" } })).toBe(0);
  });

  it("skips a company whose lease another run holds until later", async () => {
    const ran = await runClockOnce(now);
    expect(ran.some((r) => r.slug === "clks-held")).toBe(false);
    expect(await db.caseEvent.count({ where: { companyId: held.id, type: "clock.due" } })).toBe(0);
    const later = await runClockOnce(new Date(now.getTime() + 6 * 60_000));
    expect(later.find((r) => r.slug === "clks-held")!.written).toBeGreaterThan(0);
  });
});
