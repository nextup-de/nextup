// The clock scheduler against a real Postgres (CLK-D1, D13): each case fact once, as the clock.
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { getDb } from "@/lib/db/client";
import { runClockOnce } from "@/server/scheduler/clock";
import { company, facts, now } from "./clk-company";

const db = getDb();
let box: { id: string };

beforeAll(async () => {
  await db.company.deleteMany({});
  box = await company("clks-box", "sandbox");
});

afterAll(async () => {
  await db.company.deleteMany({});
  await db.$disconnect();
});

describe("CLK scheduler", () => {
  it("appends the overdue case's deadline fact once, as the clock, to the deputy's seat", async () => {
    const first = await runClockOnce(now);
    expect(first.find((r) => r.slug === "clks-box")!.written).toBeGreaterThan(0);
    const rows = await facts(box.id, "clks-box-case");
    expect(rows).toHaveLength(1);
    const f = rows[0];
    const dueDay = (f.payload as { dueDay: number }).dueDay;
    expect(f).toMatchObject({ actor: "system:clock", actorUserId: null, source: "clock", idemKey: `clk:deadline:clks-box-case:${dueDay}` });
    expect(f.payload).toMatchObject({ kind: "deadline", dueDay });
    expect((f.payload as { toRoleHolderId?: string | null }).toRoleHolderId).toBeTruthy();
  });

  it("writes nothing on a second call", async () => {
    await runClockOnce(now); // LOOP-H1: the hand-over follows the fact by one run
    await runClockOnce(now); // ten working days late is past escalation_days too: the second level's fact
    await runClockOnce(now); // and its hand-over (tests/db/clk-escalation.test.ts)
    const before = await db.caseEvent.count({ where: { companyId: box.id, type: "clock.due" } });
    const again = await runClockOnce(now);
    expect(again.find((r) => r.slug === "clks-box")!.written).toBe(0);
    expect(await db.caseEvent.count({ where: { companyId: box.id, type: "clock.due" } })).toBe(before);
  });
});
