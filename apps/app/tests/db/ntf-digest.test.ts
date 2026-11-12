// NTF-D1: the daily digest and the profile opt-in against a real Postgres (D15). Time is passed in; no mail is sent.
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { usersOfRole } from "@/features/auth/identity";
import { stampEvent } from "@/features/cases/stamp";
import { prefChange } from "@/features/notify/digest";
import { templateWrites } from "@/features/demo/content";
import { toSeedJson } from "@/features/demo/parse";
import { saveCalendar } from "@/lib/db/calendar";
import { companySeed } from "@/lib/db/companies";
import { getDb } from "@/lib/db/client";
import { appendEventRow } from "@/lib/db/events";
import { bindDemoCompany } from "@/lib/db/demo-identity";
import { prefsOf, setPref } from "@/lib/db/notify-prefs";
import { writeStructure } from "@/lib/db/structure-writes";
import { DEFAULT_CALENDAR } from "@/features/clock";
import { workdayOf } from "@/features/clock/calendar";
import { runDigests } from "@/server/notify/digest";

const db = getDb();
// 2026-05-04 is a Monday; 2026-05-14 is Ascension Day (a holiday in every German region).
const at = (iso: string) => new Date(iso);
const MON_0705 = at("2026-05-04T07:05:00+02:00");
const MON_0655 = at("2026-05-04T06:55:00+02:00");
const ASCENSION_0705 = at("2026-05-14T07:05:00+02:00");

type Box = { id: string; slug: string; ownerId: string; other: string };
let pilot: Box;
let demo: Box;
let off: Box;

/** A company with one case on the desk of `ownerId`, a user without any seat (`other`), notifications as given. */
async function company(slug: string, stage: string, notifications: boolean): Promise<Box> {
  const writes = templateWrites("demo", () => crypto.randomUUID());
  const person = (name: string, role: string, handle?: string) => ({
    name, email: name.replace(/\W+/g, "").toLowerCase() + `@${slug}.example`, role, dept: "", ini: "XX", handle: handle ?? null,
  });
  const c = await db.company.create({
    data: {
      slug, name: slug, stage, demoDay: 0, seedJson: toSeedJson(writes.seedJson) as object,
      users: { create: [person("B. Hartmann", "manager"), person("T. Vogel", "leader"), person("J. Schmidt", "member", "Anonymous #4471")] },
    },
  });
  await writeStructure(c.id, writes, "test");
  await bindDemoCompany(c.id);
  await db.companyConfig.create({ data: { companyId: c.id, notifications } });
  await saveCalendar(c.id, { ...DEFAULT_CALENDAR, region: "DE" });
  const raiser = (await db.user.findFirstOrThrow({ where: { companyId: c.id, name: "J. Schmidt" } })).id;
  const seed = await companySeed({ id: c.id, seedJson: c.seedJson, stage });
  // A route whose owner role is held by one of our users (not the raiser): that user has the case on their desk.
  let routeId = "";
  let ownerId = "";
  for (const r of seed.routes) {
    const seat = seed.seats.find((s) => s.id === r.ownerSeatId);
    const holders = seat ? usersOfRole(seed.seats, seat.roleId).filter((u) => u !== raiser) : [];
    if (holders.length) { routeId = r.id; ownerId = holders[0]; break; }
  }
  expect(routeId).not.toBe("");
  const payload = stampEvent("case.raised", { title: "Scanner broken", body: "It does not read.", routeId, kind: "problem" }, seed);
  const r = await appendEventRow(c.id, { id: `${slug}-raised`, day: 0, type: "case.raised", actor: "Anonymous #4471", targetId: `${slug}-case`, payload }, { actorUserId: raiser });
  expect(r.ok).toBe(true);
  return { id: c.id, slug, ownerId, other: raiser };
}

const digestRows = (b: Box) => db.outboxMessage.findMany({ where: { companyId: b.id, template: "digest" }, orderBy: { createdAt: "asc" } });

beforeAll(async () => {
  await db.company.deleteMany({});
  pilot = await company("ntf-dg", "pilot", true);
  demo = await company("ntf-dg-demo", "demo", true);
  off = await company("ntf-dg-off", "pilot", false);
});

afterAll(async () => {
  await db.company.deleteMany({});
  await db.$disconnect();
});

describe("NTF digest and opt-in", () => {
  it("writes nothing for a user who has not switched the digest on", async () => {
    await runDigests(MON_0705);
    expect(await digestRows(pilot)).toHaveLength(0);
  });

  it("one row per opted-in user per working day, from 07:00 Berlin, none on a holiday", async () => {
    await setPref(pilot.id, pilot.ownerId, "digest", true);
    await runDigests(MON_0655);
    expect(await digestRows(pilot)).toHaveLength(0);

    await runDigests(MON_0705);
    const rows = await digestRows(pilot);
    expect(rows).toHaveLength(1);
    expect(rows[0]).toMatchObject({ recipientUserId: pilot.ownerId, channel: "mail", status: "pending", template: "digest" });
    expect(rows[0].key).toBe(`digest:${pilot.ownerId}:${workdayOf(MON_0705, DEFAULT_CALENDAR)}`);
    expect(rows[0].address).toContain("@ntf-dg.example");
    expect(rows[0].text).toContain("Scanner broken");

    await runDigests(MON_0705);
    await runDigests(new Date(MON_0705.getTime() + 3 * 3_600_000));
    expect(await digestRows(pilot)).toHaveLength(1);

    await runDigests(ASCENSION_0705);
    expect(await digestRows(pilot)).toHaveLength(1);
  });

  it("a demo company, and a company with notifications off, get none even with the digest on", async () => {
    await setPref(demo.id, demo.ownerId, "digest", true);
    await setPref(off.id, off.ownerId, "digest", true);
    await runDigests(MON_0705);
    expect(await digestRows(demo)).toHaveLength(0);
    expect(await digestRows(off)).toHaveLength(0);
  });

  it("the profile action's logic stores the pref for the viewer only and switches a template off", async () => {
    const viewer = { userId: pilot.other, companySlug: pilot.slug };
    const c = prefChange(viewer, pilot.slug, "reminder.checkin", false);
    expect(c.ok).toBe(true);
    if (c.ok) await setPref(pilot.id, c.userId, c.template, c.on);
    const stored = await prefsOf(pilot.id, [pilot.other, pilot.ownerId]);
    expect(stored.find((r) => r.userId === pilot.other)).toEqual({ userId: pilot.other, template: "reminder.checkin", on: false });
    // Nothing was written for the owner by the other person's choice.
    expect(stored.filter((r) => r.userId === pilot.ownerId)).toEqual([{ userId: pilot.ownerId, template: "digest", on: true }]);
    // Another company's slug, no session or a template that is not switchable stores nothing.
    expect(prefChange(viewer, demo.slug, "digest", true).ok).toBe(false);
    expect(prefChange(null, pilot.slug, "digest", true).ok).toBe(false);
    expect(prefChange(viewer, pilot.slug, "webhook", true).ok).toBe(false);

    // A template turned off again by the same route: the digest of the owner, who switches it off.
    const off2 = prefChange({ userId: pilot.ownerId, companySlug: pilot.slug }, pilot.slug, "digest", false);
    if (off2.ok) await setPref(pilot.id, off2.userId, off2.template, off2.on);
    const after = (await prefsOf(pilot.id, [pilot.ownerId])).find((r) => r.template === "digest");
    expect(after?.on).toBe(false);
    await runDigests(at("2026-05-05T07:05:00+02:00"));
    expect(await digestRows(pilot)).toHaveLength(1);
  });
});
