// The second escalation level against a real Postgres: after the deputy, the seat above the owner's desk, once.
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { templateWrites } from "@/features/demo/content";
import { toSeedJson } from "@/features/demo/parse";
import { reduce } from "@/features/cases/reducer";
import { seatAbove } from "@/features/knowledge";
import { getDb } from "@/lib/db/client";
import { companySeed } from "@/lib/db/companies";
import { bindDemoCompany } from "@/lib/db/demo-identity";
import { appendEventRow, loadLog } from "@/lib/db/events";
import { loadKnowledge } from "@/lib/db/knowledge";
import { runClockOnce } from "@/server/scheduler/clock";
import { writeStructure } from "@/lib/db/structure-writes";
import { peopleForSeats } from "./test-company";

const db = getDb();
const now = new Date("2026-05-04T09:00:00+02:00");
const minutes = (n: number) => new Date(now.getTime() + n * 60_000);
const earlier = new Date(now.getTime() - 14 * 86_400_000);
type Ref = { id: string; seedJson: unknown; stage: string; caseId: string; above: string; deputyRoleId: string };
let on: Ref;
let off: Ref;

async function company(slug: string, escalationDays: number | null): Promise<Ref> {
  const writes = templateWrites("demo", () => crypto.randomUUID());
  const person = (name: string, role: string) => ({ name, email: name.replace(/\W+/g, "").toLowerCase() + `@${slug}.example`, role, dept: "", ini: "XX", handle: null });
  const c = await db.company.create({
    data: { slug, name: slug, stage: "sandbox", seedJson: toSeedJson(writes.seedJson) as object, users: { create: [person("B. Hartmann", "manager"), person("T. Vogel", "leader"), person("J. Schmidt", "member")] } },
  });
  await writeStructure(c.id, writes, "test");
  await peopleForSeats(c.id, slug);
  await bindDemoCompany(c.id);
  if (escalationDays !== null) await db.companyRule.create({ data: { companyId: c.id, key: "escalation_days", value: { days: escalationDays } } });
  const ref = { id: c.id, seedJson: c.seedJson, stage: "sandbox" };
  const seed = await companySeed(ref);
  const k = await loadKnowledge(c.id);
  // A route whose owner has an occupied deputy and somebody above both.
  const route = seed.routes.find((r) => r.ownerSeatId && r.ownerRoleId && r.deputyRoleId && seatAbove(k, r.ownerRoleId, [r.deputyRoleId]))!;
  const caseId = `${slug}-case`;
  await appendEventRow(c.id, { id: `${slug}-raised`, day: 0, type: "case.raised", actor: "J. Schmidt", targetId: caseId, payload: { title: "Late", routeId: route.id } } as never, { now: earlier });
  return { ...ref, caseId, above: seatAbove(k, route.ownerRoleId!, [route.deputyRoleId!])!.id, deputyRoleId: route.deputyRoleId! };
}

const rows = (ref: Ref, type: string) => db.caseEvent.findMany({ where: { companyId: ref.id, type, targetId: ref.caseId }, orderBy: { seq: "asc" } });
const facts = async (ref: Ref) => (await rows(ref, "clock.due")).filter((r) => (r.payload as { kind?: string }).kind === "escalation");

beforeAll(async () => {
  await db.company.deleteMany({});
  on = await company("clke-on", null);
  off = await company("clke-off", 0);
});

afterAll(async () => {
  await db.company.deleteMany({});
  await db.$disconnect();
});

describe("CLK second level", () => {
  it("deadline fact, deputy, escalation fact, seat above: one step per run, each once", async () => {
    for (let i = 0; i < 6; i++) await runClockOnce(minutes(i));

    const f = await facts(on);
    expect(f).toHaveLength(1);
    expect(f[0]).toMatchObject({ actor: "system:clock", actorUserId: null, source: "clock", idemKey: `clk:escalate:${on.caseId}` });
    expect(f[0].payload).toMatchObject({ kind: "escalation", toRoleHolderId: on.above });

    const handed = await rows(on, "case.handed");
    expect(handed.map((r) => [(r.payload as { why: string }).why, r.idemKey])).toEqual([
      ["deadline", `clk:handover:${on.caseId}`],
      ["escalation", `clk:escalate:${on.caseId}:handover`],
    ]);
    expect(handed.every((r) => r.actor === "system:clock" && r.source === "clock")).toBe(true);
    expect(handed[0].seq).toBeLessThan(f[0].seq);
    expect(f[0].seq).toBeLessThan(handed[1].seq);

    const state = reduce(await companySeed(on), await loadLog(on.id, minutes(6)));
    const c = state.cases.find((x) => x.id === on.caseId)!;
    expect(c.assigneeSeatId).toBe(on.above);
    expect(c.open).toBe(true);
    expect(state.seats.find((s) => s.id === (handed[0].payload as { toRoleHolderId: string }).toRoleHolderId)!.roleId).toBe(on.deputyRoleId);
  });

  it("escalation_days 0: the deputy takes the case and nothing follows", async () => {
    for (let i = 0; i < 6; i++) await runClockOnce(minutes(i));
    expect(await facts(off)).toHaveLength(0);
    expect((await rows(off, "case.handed")).map((r) => (r.payload as { why: string }).why)).toEqual(["deadline"]);
  });
});
