// LOOP-H1 against a real Postgres: a breached answer date hands the case to the deputy seat once.
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { templateWrites } from "@/features/demo/content";
import { toSeedJson } from "@/features/demo/parse";
import { reduce } from "@/features/cases/reducer";
import { getDb } from "@/lib/db/client";
import { companySeed } from "@/lib/db/companies";
import { bindDemoCompany } from "@/lib/db/demo-identity";
import { appendEventRow, loadLog } from "@/lib/db/events";
import { runClockOnce } from "@/server/scheduler/clock";
import { writeStructure } from "@/lib/db/structure-writes";

const db = getDb();
const now = new Date("2026-05-04T09:00:00+02:00");
const hourLater = new Date(now.getTime() + 3_600_000);
const earlier = new Date(now.getTime() - 14 * 86_400_000);
let on: { id: string; seedJson: unknown; stage: string };
let off: { id: string; seedJson: unknown; stage: string };

async function company(slug: string, handover: boolean) {
  const writes = templateWrites("demo", () => crypto.randomUUID());
  const person = (name: string, role: string) => ({ name, email: name.replace(/\W+/g, "").toLowerCase() + `@${slug}.example`, role, dept: "", ini: "XX", handle: null });
  const c = await db.company.create({
    data: { slug, name: slug, stage: "sandbox", seedJson: toSeedJson(writes.seedJson) as object, users: { create: [person("B. Hartmann", "manager"), person("T. Vogel", "leader"), person("J. Schmidt", "member")] } },
  });
  await writeStructure(c.id, writes, "test");
  await bindDemoCompany(c.id);
  if (!handover) {
    await db.companyRule.upsert({
      where: { companyId_key: { companyId: c.id, key: "deadline_handover" } },
      create: { companyId: c.id, key: "deadline_handover", value: { on: false } },
      update: { value: { on: false } },
    });
  }
  const ref = { id: c.id, seedJson: c.seedJson, stage: "sandbox" };
  const seed = await companySeed(ref);
  const route = seed.routes.find((r) => r.ownerSeatId && r.deputyRoleId)!;
  await appendEventRow(c.id, { id: `${slug}-raised`, day: 0, type: "case.raised", actor: "J. Schmidt", targetId: `${slug}-case`, payload: { title: "Late", routeId: route.id } } as never, { now: earlier });
  return ref;
}

const handed = (id: string) => db.caseEvent.findMany({ where: { companyId: id, type: "case.handed" } });

beforeAll(async () => {
  await db.company.deleteMany({});
  on = await company("loph-on", true);
  off = await company("loph-off", false);
});

afterAll(async () => {
  await db.company.deleteMany({});
  await db.$disconnect();
});

describe("LOOP hand-over once", () => {
  it("writes one case.handed with why deadline, also when run twice, and the case sits on the deputy seat", async () => {
    await runClockOnce(now);
    await runClockOnce(hourLater);
    const all = await handed(on.id);
    const ids = all.map((r) => r.targetId);
    expect(new Set(ids).size).toBe(ids.length); // one per breached case, the template's own late cases included
    const rows = all.filter((r) => r.targetId === "loph-on-case");
    expect(rows).toHaveLength(1);
    expect(rows[0]).toMatchObject({ actor: "system:clock", source: "clock", targetId: "loph-on-case", idemKey: "clk:handover:loph-on-case" });
    expect(rows[0].payload).toMatchObject({ why: "deadline" });
    const state = reduce(await companySeed(on), await loadLog(on.id, hourLater));
    const c = state.cases.find((x) => x.id === "loph-on-case")!;
    const to = (rows[0].payload as { toRoleHolderId: string }).toRoleHolderId;
    expect(c.assigneeSeatId).toBe(to);
    expect(state.seats.find((s) => s.id === to)!.roleId).toBe(c.route!.deputyRoleId);
  });

  it("writes no case.handed with the rule off, only the deadline fact", async () => {
    await runClockOnce(now);
    expect(await handed(off.id)).toHaveLength(0);
    expect(await db.caseEvent.count({ where: { companyId: off.id, type: "clock.due", targetId: "loph-off-case" } })).toBe(1);
  });
});
