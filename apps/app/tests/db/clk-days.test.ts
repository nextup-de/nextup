// Working-day stamps for real companies, demoDay for demo ones, and the backfill (CLK-B1, D9).
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { DEFAULT_CALENDAR } from "@/features/clock";
import { workdayOf } from "@/features/clock/calendar";
import { contentOnly } from "@/features/demo/content";
import { SEED } from "@/features/demo/seed";
import { getDb } from "@/lib/db/client";
import { backfillClock } from "@/lib/db/clock-backfill";
import { appendEventRow, loadLog } from "@/lib/db/events";

const db = getDb();
const now = new Date("2026-05-04T09:00:00+02:00");
let demo: { id: string };
let sandbox: { id: string };

beforeAll(async () => {
  await db.company.deleteMany({});
  const seedJson = JSON.parse(JSON.stringify(contentOnly(SEED)));
  demo = await db.company.create({ data: { slug: "clkd-demo", name: "D", stage: "demo", demoDay: 3, seedJson } });
  sandbox = await db.company.create({ data: { slug: "clkd-box", name: "S", stage: "sandbox", seedJson } });
});

afterAll(async () => {
  await db.company.deleteMany({});
  await db.$disconnect();
});

const dayOf = async (companyId: string, id: string) => (await db.caseEvent.findFirstOrThrow({ where: { id, companyId } })).day;
const raised = (id: string) => ({ id, type: "case.raised", actor: "x", targetId: id, payload: { title: "t" } }) as never;

describe("CLK working-day stamps", () => {
  it("stamps a sandbox company's event and log with the working-day number", async () => {
    const want = workdayOf(now, DEFAULT_CALENDAR);
    expect(await appendEventRow(sandbox.id, raised("clkd-s1"), { now })).toEqual({ ok: true, duplicate: false });
    expect(await dayOf(sandbox.id, "clkd-s1")).toBe(want);
    expect((await loadLog(sandbox.id, now)).day).toBe(want);
  });

  it("keeps demoDay for a demo company", async () => {
    await appendEventRow(demo.id, raised("clkd-d1"), { now });
    expect(await dayOf(demo.id, "clkd-d1")).toBe(3);
    expect((await loadLog(demo.id, now)).day).toBe(3);
  });

  it("backfills stored days from their timestamps, once, and leaves demo alone", async () => {
    await appendEventRow(sandbox.id, raised("clkd-s2"), { now });
    await db.caseEvent.updateMany({ where: { id: "clkd-s2", companyId: sandbox.id }, data: { day: 0, ts: new Date("2026-04-30T10:00:00+02:00") } });
    const first = await backfillClock();
    expect(first.find((l) => l.slug === "clkd-box")?.line).toMatch(/^clkd-box: \d+ days set$/);
    expect(first.some((l) => l.slug === "clkd-demo")).toBe(false);
    expect(await dayOf(sandbox.id, "clkd-s2")).toBe(workdayOf(new Date("2026-04-30T10:00:00+02:00"), DEFAULT_CALENDAR));
    expect(await dayOf(demo.id, "clkd-d1")).toBe(3);
    expect((await backfillClock()).find((l) => l.slug === "clkd-box")?.line).toBe("clkd-box: left as it is");
  });
});
