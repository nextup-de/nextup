// LOOP-I1: a KPI file becomes the measure of an open check, unconfirmed until a second person confirms it.
import { afterAll, beforeAll, describe, expect, it, vi } from "vitest";
import type { CaseEventType, EventPayload } from "@/features/cases/events";
import { reduce } from "@/features/cases/reducer";
import { seedFor } from "@/features/demo";
import { templateWrites } from "@/features/demo/content";
import { toSeedJson } from "@/features/demo/parse";
import { bindDemoCompany } from "@/lib/db/demo-identity";
import { getDb } from "@/lib/db/client";
import { appendEventRow, loadLogForSlug } from "@/lib/db/events";
import { writeStructure } from "@/lib/db/structure-writes";

type V = { userId: string; companyId: string; role: string; name: string; handle: string | null };
const session = vi.hoisted(() => ({ viewer: null as null | V }));
vi.mock("@/features/auth/session", () => ({ getViewerFor: async () => session.viewer }));
vi.mock("next/headers", () => ({ cookies: async () => ({ get: () => undefined }) }));
vi.mock("next/cache", () => ({ revalidatePath: () => undefined }));
vi.mock("@/server/jira-sync", () => ({ kickJira: () => undefined }));
import { appendEventAction } from "@/server/actions/events";
import { importMeasuresAction } from "@/server/actions/measures";

const db = getDb();
const SLUG = "loop-measure-import";
const PID = "p_import";
let companyId = "";
const u = { lead: "", member: "", manager: "" };
const viewer = (userId: string, role: string, name: string): V => ({ userId, companyId, role, name, handle: null });

async function add(type: CaseEventType, target: string | null, payload: EventPayload, userId: string, day: number) {
  await db.company.update({ where: { id: companyId }, data: { demoDay: day } });
  const r = await appendEventRow(companyId, { id: crypto.randomUUID(), day: 0, type, actor: "x", targetId: target, payload }, { actorUserId: userId });
  expect(r.ok).toBe(true);
}
const stateNow = async () => reduce(await seedFor(SLUG), (await loadLogForSlug(SLUG))!);
const file = (metric: string, v = "12,5") => ({ name: "kpi.csv", text: `Datum;Kennzahl;Wert\n31.10.2026;${metric};${v}\n` });

beforeAll(async () => {
  await db.company.deleteMany({ where: { slug: SLUG } });
  const writes = templateWrites("demo", () => crypto.randomUUID());
  const person = (name: string, role: string) => ({ name, email: name.replace(/\W+/g, "").toLowerCase() + "@loop-import.example", role, dept: "", ini: "XX", handle: null });
  const c = await db.company.create({
    data: {
      slug: SLUG, name: "LOOP import", stage: "demo", seedJson: toSeedJson(writes.seedJson) as object,
      users: { create: [person("L. Lead", "leader"), person("M. Member", "member"), person("B. Boss", "manager")] },
    },
  });
  companyId = c.id;
  await writeStructure(c.id, writes, "test");
  await bindDemoCompany(c.id);
  const users = await db.user.findMany({ where: { companyId }, select: { id: true, name: true } });
  const idOf = (n: string) => users.find((x) => x.name === n)!.id;
  [u.lead, u.member, u.manager] = [idOf("L. Lead"), idOf("M. Member"), idOf("B. Boss")];
  const routeId = (await seedFor(SLUG)).routes[0].id;

  await add("case.raised", "c_imp", { kind: "idea", title: "Idea", body: "text", routeId, assignee: "Triage desk" }, u.member, 0);
  await add("case.decided", "c_imp", { answer: "yes", projectId: PID, lead: "L. Lead", leadUserId: u.lead, title: "Shorter changeover" }, u.manager, 0);
  await add("project.baseline", PID, { metric: "Changeover", unit: "min", value: 42, better: "down", source: "MES" }, u.lead, 1);
  await add("project.started", PID, {}, u.lead, 1);
  await add("project.done", PID, { note: "Live" }, u.lead, 2);
  await db.company.update({ where: { id: companyId }, data: { demoDay: 40 } }); // the 30-day check is open
}, 60_000);

afterAll(async () => {
  await db.company.deleteMany({ where: { slug: SLUG } });
  await db.$disconnect();
});

describe("LOOP measure import", () => {
  it("refuses a member", async () => {
    session.viewer = viewer(u.member, "member", "M. Member");
    expect(await importMeasuresAction(SLUG, PID, 30, file("Changeover"))).toEqual({ ok: false, code: "not-allowed" });
  });

  it("refuses a file over 1 MB, an empty one, and one without the baseline metric", async () => {
    session.viewer = viewer(u.lead, "leader", "L. Lead");
    expect(await importMeasuresAction(SLUG, PID, 30, { name: "big.csv", text: "x".repeat(1.1 * 1024 * 1024) })).toEqual({ ok: false, code: "too-large" });
    expect(await importMeasuresAction(SLUG, PID, 30, { name: "e.csv", text: "nothing" })).toEqual({ ok: false, code: "no-rows" });
    expect(await importMeasuresAction(SLUG, PID, 30, file("Other"))).toEqual({ ok: false, code: "no-metric" });
  });

  it("the lead's import appends an unconfirmed measure; only a second person's confirmation makes it count", async () => {
    session.viewer = viewer(u.lead, "leader", "L. Lead");
    const r = await importMeasuresAction(SLUG, PID, 30, file("changeover "));
    expect(r).toEqual({ ok: true, value: 12.5, date: "2026-10-31" });
    const row = await db.caseEvent.findFirstOrThrow({ where: { companyId, type: "project.measured" } });
    const src = (row.payload as { source: { kind: string; file: string; sha256: string; rows: number } }).source;
    expect(src).toMatchObject({ kind: "import", file: "kpi.csv", rows: 1 });
    expect(src.sha256).toMatch(/^[0-9a-f]{64}$/);
    expect(JSON.stringify(row.payload)).not.toContain("31.10.2026");

    let p = (await stateNow()).projects.find((x) => x.id === PID)!;
    expect(p.measures[0]).toMatchObject({ check: 30, sourceKind: "import", confirmed: false });

    // the lead cannot confirm their own; a distinct manager can
    expect((await appendEventAction({ slug: SLUG, id: "conf1", type: "project.measure.confirmed", target: PID, payload: { check: 30 } })).ok).toBe(false);
    session.viewer = viewer(u.manager, "manager", "B. Boss");
    expect((await appendEventAction({ slug: SLUG, id: "conf2", type: "project.measure.confirmed", target: PID, payload: { check: 30 } })).ok).toBe(true);
    p = (await stateNow()).projects.find((x) => x.id === PID)!;
    expect(p.measures[0]).toMatchObject({ confirmed: true, confirmedByUserId: u.manager });
  });

  it("a second import for the same check is a closed check", async () => {
    session.viewer = viewer(u.lead, "leader", "L. Lead");
    expect(await importMeasuresAction(SLUG, PID, 30, file("Changeover", "10"))).toEqual({ ok: false, code: "closed-check" });
  });
});
