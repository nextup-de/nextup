// The clock scheduler against a real Postgres (CLK-D1, D13): each due fact once, under a per-company lease.
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { templateWrites } from "@/features/demo/content";
import { toSeedJson } from "@/features/demo/parse";
import { workdayOf } from "@/features/clock/calendar";
import { DEFAULT_CALENDAR } from "@/features/clock";
import { getDb } from "@/lib/db/client";
import { companySeed } from "@/lib/db/companies";
import { bindDemoCompany } from "@/lib/db/demo-identity";
import { appendEventRow } from "@/lib/db/events";
import { runClockOnce } from "@/server/scheduler/clock";
import { writeStructure } from "@/lib/db/structure-writes";

const db = getDb();
const now = new Date("2026-05-04T09:00:00+02:00");
const earlier = new Date(now.getTime() - 14 * 86_400_000); // ten working days before now
let box: { id: string };
let demo: { id: string };
let held: { id: string };

async function company(slug: string, stage: string, demoDay = 0) {
  const writes = templateWrites("demo", () => crypto.randomUUID());
  const person = (name: string, role: string) => ({ name, email: name.replace(/\W+/g, "").toLowerCase() + `@${slug}.example`, role, dept: "", ini: "XX", handle: null });
  const c = await db.company.create({
    data: { slug, name: slug, stage, demoDay, seedJson: toSeedJson(writes.seedJson) as object, users: { create: [person("B. Hartmann", "manager"), person("T. Vogel", "leader"), person("J. Schmidt", "member")] } },
  });
  await writeStructure(c.id, writes, "test");
  await bindDemoCompany(c.id);
  const seed = await companySeed({ id: c.id, seedJson: c.seedJson, stage });
  const routeId = seed.routes.find((r) => r.ownerSeatId)!.id;
  await appendEventRow(c.id, { id: `${slug}-raised`, day: 0, type: "case.raised", actor: "J. Schmidt", targetId: `${slug}-case`, payload: { title: "Late", routeId } } as never, { now: earlier });
  return c;
}

const facts = (companyId: string, target: string) => db.caseEvent.findMany({ where: { companyId, type: "clock.due", targetId: target } });

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
    const before = await db.caseEvent.count({ where: { companyId: box.id, type: "clock.due" } });
    const again = await runClockOnce(now);
    expect(again.find((r) => r.slug === "clks-box")!.written).toBe(0);
    expect(await db.caseEvent.count({ where: { companyId: box.id, type: "clock.due" } })).toBe(before);
  });

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
