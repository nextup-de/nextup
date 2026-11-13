// The clock scheduler against a real Postgres (CLK-D1): a project's start fact, once, as the clock.
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { getDb } from "@/lib/db/client";
import { companySeed } from "@/lib/db/companies";
import { appendEventRow } from "@/lib/db/events";
import { runClockOnce } from "@/server/scheduler/clock";
import { company, earlier, facts, now } from "./clk-company";

const db = getDb();
let box: Awaited<ReturnType<typeof company>>;

beforeAll(async () => {
  await db.company.deleteMany({});
  box = await company("clks-proj", "sandbox");
  // A legacy yes (no draft) ten working days ago: the project is in planning and its start day has long passed.
  const seed = await companySeed({ id: box.id, seedJson: box.seedJson, stage: "sandbox" });
  const routeId = seed.routes.find((r) => r.ownerSeatId)!.id;
  await appendEventRow(box.id, { id: "clks-proj-raised2", day: 0, type: "case.raised", actor: "J. Schmidt", targetId: "clks-proj-case2", payload: { title: "Faster", routeId } } as never, { now: earlier });
  await appendEventRow(box.id, { id: "clks-proj-yes", day: 0, type: "case.decided", actor: "T. Vogel", targetId: "clks-proj-case2", payload: { answer: "yes", projectId: "p_start", lead: "J. Schmidt", title: "Faster" } } as never, { now: earlier });
});

afterAll(async () => {
  await db.company.deleteMany({});
  await db.$disconnect();
});

describe("CLK scheduler project", () => {
  it("a legacy project in planning past its start day gets one start fact, as the clock, and none on a second run", async () => {
    await runClockOnce(now);
    const rows = await facts(box.id, "p_start");
    expect(rows).toHaveLength(1);
    const dueDay = (rows[0].payload as { dueDay: number }).dueDay;
    expect(rows[0]).toMatchObject({ actor: "system:clock", actorUserId: null, source: "clock", idemKey: `clk:start:p_start:${dueDay}` });
    expect(rows[0].payload).toMatchObject({ kind: "start", dueDay });
    await runClockOnce(now);
    expect(await facts(box.id, "p_start")).toHaveLength(1);
  });
});
