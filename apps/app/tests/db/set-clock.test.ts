// SET-D1 against a real Postgres: a lead who never answers and an invitee who never answers are lapsed by the clock,
// as system:clock, once (D11, D12). The reminders before them are facts; the lapse is the answer itself.
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { templateWrites } from "@/features/demo/content";
import { toSeedJson } from "@/features/demo/parse";
import { getDb } from "@/lib/db/client";
import { companySeed } from "@/lib/db/companies";
import { bindDemoCompany } from "@/lib/db/demo-identity";
import { peopleForSeats } from "./test-company";
import { appendEventRow } from "@/lib/db/events";
import { runClockOnce } from "@/server/scheduler/clock";
import { writeStructure } from "@/lib/db/structure-writes";

const db = getDb();
const asked = new Date("2026-05-04T09:00:00+02:00"); // a Monday
const at = (workdays: number) => new Date(asked.getTime() + workdays * 86_400_000 + (workdays >= 5 ? 2 * 86_400_000 : 0)); // 05-06, 05-08, then 05-11 across the weekend
const SLUG = "setc-box";
let companyId: string;
let user: Record<string, string>;

beforeAll(async () => {
  await db.company.deleteMany({});
  const writes = templateWrites("demo", () => crypto.randomUUID());
  const person = (name: string, role: string) => ({ name, email: name.replace(/\W+/g, "").toLowerCase() + `@${SLUG}.example`, role, dept: "", ini: "XX", handle: null });
  const c = await db.company.create({
    data: { slug: SLUG, name: SLUG, stage: "sandbox", seedJson: toSeedJson(writes.seedJson) as object, users: { create: [person("B. Hartmann", "manager"), person("T. Vogel", "leader"), person("J. Schmidt", "member")] } },
  });
  await writeStructure(c.id, writes, "test");
  await peopleForSeats(c.id, SLUG);
  await bindDemoCompany(c.id);
  companyId = c.id;
  user = Object.fromEntries((await db.user.findMany({ where: { companyId } })).map((u) => [u.name, u.id]));
  const route = (await companySeed({ id: companyId, seedJson: c.seedJson, stage: "sandbox" })).routes.find((r) => r.ownerSeatId)!;
  const append = async (e: Record<string, unknown>, actorUserId: string) => {
    const r = await appendEventRow(companyId, { day: 0, ...e } as never, { actorUserId, now: asked });
    if (!r.ok) throw new Error(r.error);
  };
  for (const [k, lead] of [["lead", "B. Hartmann"], ["invite", "T. Vogel"]] as const) {
    await append({ id: `${SLUG}-${k}-raised`, type: "case.raised", actor: "J. Schmidt", targetId: `${SLUG}-${k}-case`, payload: { kind: "idea", title: `Idea ${k}`, routeId: route.id } }, user["J. Schmidt"]);
    // T. Vogel says yes; in "lead" the lead is someone else and has to accept, in "invite" the decider leads and invites.
    await append(
      { id: `${SLUG}-${k}-yes`, type: "case.decided", actor: "T. Vogel", targetId: `${SLUG}-${k}-case`, payload: { answer: "yes", projectId: `p_${k}`, lead, leadUserId: user[lead], title: `Project ${k}`, draft: true } },
      user["T. Vogel"],
    );
  }
  await append({ id: `${SLUG}-invited`, type: "project.invited", actor: "T. Vogel", targetId: "p_invite", payload: { userId: user["J. Schmidt"], role: "contributor" } }, user["T. Vogel"]);
});

afterAll(async () => {
  await db.company.deleteMany({});
  await db.$disconnect();
});

const rows = (type: string, target: string) => db.caseEvent.findMany({ where: { companyId, type, targetId: target } });

describe("SET clock lapses", () => {
  it("reminds the lead and the invitee as facts, once each, after 2 working days", async () => {
    await runClockOnce(at(2));
    await runClockOnce(at(2));
    const lead = await rows("clock.due", "p_lead");
    const invite = await rows("clock.due", "p_invite");
    expect(lead.map((r) => r.payload)).toMatchObject([{ kind: "lead", userId: user["B. Hartmann"] }]);
    expect(invite.map((r) => r.payload)).toMatchObject([{ kind: "invite", userId: user["J. Schmidt"], inviteId: `${SLUG}-invited` }]);
    expect(lead[0]).toMatchObject({ actor: "system:clock", source: "clock" });
  });

  it("writes project.lead.answered take false lapsed true after 4 working days, once", async () => {
    await runClockOnce(at(4));
    await runClockOnce(at(4));
    const lapses = await rows("project.lead.answered", "p_lead");
    expect(lapses).toHaveLength(1);
    expect(lapses[0]).toMatchObject({ actor: "system:clock", actorUserId: null, source: "clock", payload: { take: false, lapsed: true, askId: `${SLUG}-lead-yes` } });
    expect(lapses[0].id).toBe(`e_clk_${companyId}_${lapses[0].idemKey}`);
    expect(await rows("project.invite.answered", "p_invite")).toHaveLength(0);
  });

  it("writes project.invite.answered lapsed true after 5 working days, once, and the lead's lapse stays one", async () => {
    await runClockOnce(at(5));
    await runClockOnce(at(5));
    const lapses = await rows("project.invite.answered", "p_invite");
    expect(lapses).toHaveLength(1);
    expect(lapses[0]).toMatchObject({ actor: "system:clock", actorUserId: null, source: "clock", payload: { inviteId: `${SLUG}-invited`, userId: user["J. Schmidt"], take: false, lapsed: true } });
    expect(await rows("project.lead.answered", "p_lead")).toHaveLength(1);
  });
});
