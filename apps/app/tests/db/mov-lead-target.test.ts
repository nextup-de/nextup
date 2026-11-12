// MOV-B1 (review corrections): whoever is handed a project or named its new lead must be an active person of this company, and
// the actor must hold the right to do it now. The append hook of the project area, against real Postgres.
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import type { SeatRow } from "@/features/auth/identity";
import type { CaseEvent, CaseEventType, EventPayload } from "@/features/cases/events";
import { reduce, type State } from "@/features/cases/reducer";
import { toSeedJson } from "@/features/demo/parse";
import { SEED } from "@/features/demo/seed";
import type { Seed } from "@/features/demo/types";
import type { ProjectEscalation, ReducedProject } from "@/features/projects/types";
import { getDb } from "@/lib/db/client";
import type { AppendCtx } from "@/server/actions/append/shared";
import { prepareProjectAppend } from "@/server/actions/append/project";

const db = getDb();
const SLUG = "mov-lead-target";
const OTHER = "mov-lead-target-b";
const ids = { company: "", other: "", lead: "", sponsor: "", desk: "", up: "", member: "", fresh: "", gone: "", foreign: "" };

const seats = (): SeatRow[] => [
  { id: "s_desk", roleId: "role_owner", label: "Desk", userId: ids.desk, sort: 1 },
  { id: "s_up", roleId: "role_up", label: "Above", userId: ids.up, sort: 2 },
];
const seed = (): Seed => ({
  ...SEED, seats: seats(),
  routes: SEED.routes.map((r) => (r.id === "r1" ? { ...r, ownerRoleId: "role_owner", deputyRoleId: "role_deputy" } : r)),
});

let n = 0;
const ev = (type: CaseEventType, actor: string, actorUserId: string | null, target: string, payload: EventPayload = {}): CaseEvent =>
  ({ id: "lt" + n++, ts: 0, type, actor, actorUserId, target, payload, day: 0 });

/** A started project p_m with a lead; `patch` puts it in the state a test needs (a vacated lead, an escalation, a sponsor). */
function projectState(patch: Partial<ReducedProject>): State {
  const events = [
    ev("case.raised", "Anonymous #4471", null, "c_m", { kind: "idea", title: "Idea", body: "text", routeId: "r1", assignee: "T. Vogel" }),
    ev("case.decided", "T. Vogel", ids.desk, "c_m", { answer: "yes", projectId: "p_m", lead: "Lead", leadUserId: ids.lead, title: "Changeover cart" }),
    ev("project.baseline", "Lead", ids.lead, "p_m", { metric: "m", unit: "min", value: 42, better: "down" }),
    ev("project.started", "Lead", ids.lead, "p_m"),
  ];
  const state = reduce(seed(), { events, day: 6 });
  const p = state.projects.find((x) => x.id === "p_m");
  if (!p) throw new Error("no project");
  Object.assign(p, { sponsorUserId: ids.sponsor }, patch);
  return state;
}
const vacant: Partial<ReducedProject> = { leadUserId: null, lead: "", leadVacatedDay: 5 };
const stalled = (live = true): ProjectEscalation => ({ to: "Above", toSeatId: "s_up", toRoleId: "role_up", from: "Desk", day: 5, live, what: "stalled", toUserId: null });

const run = (who: string, role: string, type: "project.handed" | "project.lead.changed", payload: EventPayload, state: State) => {
  const ctx: AppendCtx = { companyId: ids.company, viewer: { userId: who, role }, type, target: "p_m", payload, state, seed: seed(), locale: "en" };
  return prepareProjectAppend(ctx);
};
const named = (toUserId: string): EventPayload => ({ to: "Somebody", toUserId, why: "Takes it on" });

beforeAll(async () => {
  await db.company.deleteMany({ where: { slug: { in: [SLUG, OTHER] } } });
  ids.company = (await db.company.create({ data: { slug: SLUG, name: "MOV lead target", stage: "pilot", seedJson: toSeedJson(SEED) as object } })).id;
  ids.other = (await db.company.create({ data: { slug: OTHER, name: "MOV lead target B", stage: "pilot", seedJson: toSeedJson(SEED) as object } })).id;
  const user = async (companyId: string, name: string, active = true) =>
    (await db.user.create({ data: { companyId, name, email: name.replace(/\W/g, "") + "@mov-lead-target.example", role: "member", active } })).id;
  ids.lead = await user(ids.company, "Lead Lena");
  ids.sponsor = await user(ids.company, "Sponsor Sam");
  ids.desk = await user(ids.company, "Desk Dana");
  ids.up = await user(ids.company, "Above Alex");
  ids.member = await user(ids.company, "Member Max");
  ids.fresh = await user(ids.company, "Fresh Fay");
  ids.gone = await user(ids.company, "Gone Gus", false);
  ids.foreign = await user(ids.other, "Foreign Finn");
});
afterAll(async () => {
  await db.company.deleteMany({ where: { slug: { in: [SLUG, OTHER] } } });
  await db.$disconnect();
});

describe("MOV lead target", () => {
  it("accepts an active member of the company, for a new lead and for a hand-over, and hands the payload on unchanged", async () => {
    const payload = named(ids.fresh);
    expect(await run(ids.sponsor, "member", "project.lead.changed", payload, projectState(vacant))).toEqual({ ok: true, payload });
    expect(await run(ids.lead, "leader", "project.handed", payload, projectState({}))).toEqual({ ok: true, payload });
    expect(await run(ids.sponsor, "member", "project.handed", payload, projectState({}))).toEqual({ ok: true, payload });
  });

  it("refuses an id that belongs to another company", async () => {
    for (const [who, role, type, state] of [
      [ids.sponsor, "member", "project.lead.changed", projectState(vacant)],
      [ids.lead, "leader", "project.handed", projectState({})],
    ] as const) {
      const out = await run(who, role, type, named(ids.foreign), state);
      expect(out, type).toEqual({ ok: false, error: "Pick a person who can lead the project." });
    }
  });

  it("refuses an inactive person and an id nobody has", async () => {
    for (const toUserId of [ids.gone, "forged-id", "", "00000000-0000-0000-0000-000000000000"]) {
      expect((await run(ids.sponsor, "member", "project.lead.changed", named(toUserId), projectState(vacant))).ok, toUserId).toBe(false);
      expect((await run(ids.lead, "leader", "project.handed", named(toUserId), projectState({}))).ok, toUserId).toBe(false);
    }
    expect((await run(ids.sponsor, "member", "project.lead.changed", { to: "Nobody" }, projectState(vacant))).ok).toBe(false);
  });

  it("refuses a person who was deactivated after the sheet was opened", async () => {
    const late = await db.user.create({ data: { companyId: ids.company, name: "Late Leaver", email: "late@mov-lead-target.example", role: "member" } });
    const state = projectState(vacant);
    expect((await run(ids.sponsor, "member", "project.lead.changed", named(late.id), state)).ok).toBe(true);
    await db.user.update({ where: { id: late.id, companyId: ids.company }, data: { active: false } });
    expect((await run(ids.sponsor, "member", "project.lead.changed", named(late.id), state)).ok).toBe(false);
  });

  it("refuses stale authority: a lead was named meanwhile, the actor's right is gone, the escalation is over", async () => {
    // The sheet showed "No lead"; by the time it is sent the project has one again.
    const again = await run(ids.sponsor, "member", "project.lead.changed", named(ids.fresh), projectState({ leadVacatedDay: null }));
    expect(again).toMatchObject({ ok: false });
    expect(again.ok ? "" : again.error).toContain("still has a lead");
    // Somebody who is neither sponsor, desk, decider nor manager.
    expect((await run(ids.member, "member", "project.lead.changed", named(ids.fresh), projectState(vacant))).ok).toBe(false);
    // The sponsor left the project: the old sponsor's sheet no longer names a lead.
    expect((await run(ids.sponsor, "member", "project.lead.changed", named(ids.fresh), projectState({ ...vacant, sponsorUserId: null }))).ok).toBe(false);
    // The previous lead hands on after being replaced.
    expect((await run(ids.lead, "leader", "project.handed", named(ids.fresh), projectState({ leadUserId: ids.member }))).ok).toBe(false);
    // The seat above may hand on only while the stalled escalation stands.
    expect((await run(ids.up, "leader", "project.handed", named(ids.fresh), projectState({ escalated: stalled() }))).ok).toBe(true);
    expect((await run(ids.up, "leader", "project.handed", named(ids.fresh), projectState({ escalated: stalled(false) }))).ok).toBe(false);
    expect((await run(ids.up, "leader", "project.handed", named(ids.fresh), projectState({}))).ok).toBe(false);
  });

  it("leaves every other project event alone", async () => {
    const payload: EventPayload = { why: "Not needed any more" };
    const ctx: AppendCtx = { companyId: ids.company, viewer: { userId: ids.member, role: "member" }, type: "project.stopped", target: "p_m", payload, state: projectState({}), seed: seed(), locale: "en" };
    expect(await prepareProjectAppend(ctx)).toEqual({ ok: true, payload });
  });
});
