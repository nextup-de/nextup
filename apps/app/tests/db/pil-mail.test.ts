// PIL-M1: the weekly pilot report mail (runPilotReports) and the Weekly email card's actions, on a real Postgres.
// Nothing reaches a relay: the rows are only written, never delivered.
import { afterAll, beforeAll, describe, expect, it, vi } from "vitest";
import type { Viewer } from "@/features/auth/session";
import { EMPTY_SEED } from "@/features/demo";
import { toSeedJson } from "@/features/demo/parse";

let viewer: Viewer | null = null;
vi.mock("@/features/auth/session", () => ({ getViewerFor: vi.fn(async (slug: string) => (viewer && viewer.companySlug === slug ? viewer : null)) }));
vi.mock("next/cache", () => ({ revalidatePath: vi.fn() }));

import { getDb } from "@/lib/db/client";
import { runPilotReports } from "@/server/notify/pilot-report";
import { savePilotReportRecipientsAction, sendMeThisWeekAction } from "@/server/actions/settings/pilot-report";

const db = getDb();
const PILOT = "pil-mail-pilot";
const AFTER = "pil-mail-after";
const BOX = "pil-mail-box";
const SLUGS = [PILOT, AFTER, BOX];
const MONDAY = new Date("2026-11-09T08:00:00+01:00");
const ids: Record<string, Record<string, string>> = {};

const stageRow = (companyId: string, at: string, before: string | null, after: string) =>
  db.auditEvent.create({
    data: { companyId, at: new Date(at), actorKind: "platform", action: "audit.company.stage", targetKind: "company", targetId: companyId, changes: { stage: { before, after } }, source: "platform" },
  });

async function make(slug: string, stage: string) {
  const seedJson = toSeedJson(EMPTY_SEED) as object;
  const companyId = (await db.company.create({ data: { slug, name: `Co ${slug}`, stage, seedJson } })).id;
  const user = async (key: string, role: string, active: boolean, on: boolean | null) => {
    const id = (await db.user.create({ data: { companyId, name: key, email: `${key}@${slug}.example`, role, active }, select: { id: true } })).id;
    if (on !== null) await db.notifyPreference.create({ data: { companyId, userId: id, template: "pilot.report", on } });
    return id;
  };
  ids[slug] = {
    companyId,
    chosen: await user("chosen", "manager", true, true),
    off: await user("off", "manager", true, false),
    nopref: await user("nopref", "manager", true, null),
    gone: await user("gone", "manager", false, true),
    member: await user("member", "member", true, true),
  };
}

const rows = (slug: string) => db.outboxMessage.findMany({ where: { companyId: ids[slug].companyId, template: "pilot.report" }, orderBy: { key: "asc" } });

beforeAll(async () => {
  await db.company.deleteMany({ where: { slug: { in: SLUGS } } });
  await make(PILOT, "pilot");
  await make(AFTER, "sandbox");
  await make(BOX, "sandbox");
  await stageRow(ids[PILOT].companyId, "2026-10-28T09:00:00+01:00", "sandbox", "pilot");
  await stageRow(ids[AFTER].companyId, "2026-10-28T09:00:00+01:00", "sandbox", "pilot");
  await stageRow(ids[AFTER].companyId, "2026-11-04T09:00:00+01:00", "pilot", "sandbox");
}, 60_000);

afterAll(async () => {
  await db.company.deleteMany({ where: { slug: { in: SLUGS } } });
  await db.$disconnect();
});

describe("PIL mail", () => {
  it("writes nothing before 07:00 Berlin or on a day that is not the first working day", async () => {
    await runPilotReports(new Date("2026-11-09T06:30:00+01:00"), PILOT);
    await runPilotReports(new Date("2026-11-10T09:00:00+01:00"), PILOT);
    expect(await rows(PILOT)).toHaveLength(0);
  });

  it("writes one row per chosen active manager for last week, and a second run writes nothing", async () => {
    expect(await runPilotReports(MONDAY, PILOT)).toBe(1);
    const r = await rows(PILOT);
    expect(r).toHaveLength(1);
    expect(r[0]).toMatchObject({
      key: `pilot:2026-W45:${ids[PILOT].chosen}`, recipientUserId: ids[PILOT].chosen, address: `chosen@${PILOT}.example`,
      channel: "mail", status: "pending", template: "pilot.report",
    });
    expect(r[0].text).toContain("pilot week 2");
    expect(r[0].link).toContain(`/settings/pilot-report`);
    expect(await runPilotReports(new Date("2026-11-09T09:00:00+01:00"), PILOT)).toBe(0);
    expect(await rows(PILOT)).toHaveLength(1);
  });

  it("gives nothing to a default-on user with no row, an opted-out, an inactive or a non-manager user", async () => {
    const to = (await rows(PILOT)).map((r) => r.recipientUserId);
    for (const k of ["nopref", "off", "gone", "member"]) expect(to).not.toContain(ids[PILOT][k]);
  });

  it("skips the rows of a sandbox after a pilot, and writes none for a sandbox that never was in pilot", async () => {
    expect(await runPilotReports(MONDAY, AFTER)).toBe(1);
    const r = await rows(AFTER);
    expect(r).toHaveLength(1);
    expect(r[0]).toMatchObject({ status: "skipped", lastError: "sandbox" });
    expect(await runPilotReports(MONDAY, BOX)).toBe(0);
    expect(await rows(BOX)).toHaveLength(0);
  });

  it("the actions: recipients are active managers only, and send-me uses its own key", async () => {
    const co = ids[PILOT];
    viewer = { userId: co.chosen, companyId: co.companyId, companySlug: PILOT, role: "manager" } as Viewer;
    const bad = new FormData();
    bad.set("slug", PILOT);
    bad.append("userId", co.member);
    expect(await savePilotReportRecipientsAction({}, bad)).toMatchObject({ error: "settingsPilotReport.emailNotManager" });

    const good = new FormData();
    good.set("slug", PILOT);
    good.append("userId", co.nopref);
    expect(await savePilotReportRecipientsAction({}, good)).toEqual({ ok: true });
    const on = await db.notifyPreference.findMany({ where: { companyId: co.companyId, template: "pilot.report", on: true }, select: { userId: true } });
    expect(on.map((p) => p.userId)).toEqual([co.nopref]);

    const send = new FormData();
    send.set("slug", PILOT);
    expect(await sendMeThisWeekAction({}, send)).toEqual({ ok: true });
    const mine = (await db.outboxMessage.findMany({ where: { companyId: co.companyId, template: "pilot.report", recipientUserId: co.chosen } }));
    expect(mine.some((r) => r.key.startsWith(`pilot-me:2026-W`) && r.address === `chosen@${PILOT}.example`)).toBe(true);

    viewer = { userId: ids[BOX].chosen, companyId: ids[BOX].companyId, companySlug: BOX, role: "manager" } as Viewer;
    send.set("slug", BOX);
    expect(await sendMeThisWeekAction({}, send)).toEqual({ error: "settingsPilotReport.emailSandbox" });
    viewer = null;
    expect(await sendMeThisWeekAction({}, send)).toEqual({ error: "settingsCompany.forbidden" });
  });
});
