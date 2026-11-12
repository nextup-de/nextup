// PIL-A1: moving the stage from Go-live (lib/db/go-live.ts, the settings actions) and by platform job, on a real Postgres.
// No test reaches a relay or a backup volume: both are mocked.
import { afterAll, beforeAll, beforeEach, describe, expect, it, vi } from "vitest";
import type { Viewer } from "@/features/auth/session";
import { SEED } from "@/features/demo/seed";

const mocks = vi.hoisted(() => ({
  mail: { configured: true, reachable: true as boolean | null },
  backup: null as { at: Date; offbox: boolean } | null,
}));
vi.mock("@/server/mail", () => ({
  mailStatus: vi.fn(async () => mocks.mail),
  sendMail: vi.fn(async () => ({ ok: true })),
  mailConfigured: () => true,
}));
vi.mock("@/server/backup-status", () => ({ readBackupStatus: vi.fn(async () => mocks.backup) }));
// The restore test is a needed check too (REM-O3): one that passed a day ago.
vi.mock("@/server/restore-status", () => ({ readRestoreStatus: vi.fn(async () => ({ at: new Date(Date.now() - 86_400_000), seconds: 300 })) }));
let viewer: Viewer | null = null;
vi.mock("@/features/auth/session", () => ({ getViewerFor: vi.fn(async (slug: string) => (viewer && viewer.companySlug === slug ? viewer : null)) }));
vi.mock("next/cache", () => ({ revalidatePath: vi.fn() }));

import { getDb } from "@/lib/db/client";
import { recordAgreement } from "@/lib/db/agreements";
import { stageMoves } from "@/lib/db/go-live";
import { checkGoLiveAction, moveStageAction } from "@/server/actions/settings/go-live";
import { pullPlatformJobs } from "@/server/platform-jobs-sync";

const db = getDb();
const SLUGS = ["pil-sb", "pil-pilot", "pil-demo", "pil-live", "pil-job"];
const ids: Record<string, { companyId: string; managerId: string }> = {};

async function make(slug: string, stage: string) {
  const c = await db.company.create({ data: { openedAt: new Date(), slug, name: `Name ${slug}`, mark: "M", seedJson: JSON.parse(JSON.stringify(SEED)), stage } });
  const manager = await db.user.create({ data: { companyId: c.id, name: "m", email: `m@${slug}.example`, role: "manager", active: true, loginCodeAt: new Date(), totpEnabledAt: new Date() } });
  const second = await db.user.create({ data: { companyId: c.id, name: "m2", email: `m2@${slug}.example`, role: "manager", active: true, loginCodeAt: new Date(), totpEnabledAt: new Date() } });
  await db.user.create({ data: { companyId: c.id, name: "gone", email: `g@${slug}.example`, role: "manager", active: false } });
  const unit = await db.orgUnit.create({ data: { companyId: c.id, key: "OPS", name: "Operations", kind: "dept", headcount: 2, sort: 0 } });
  const role = await db.orgRole.create({ data: { companyId: c.id, orgUnitId: unit.id, title: "Ops lead", decides: [], sort: 0 } });
  await db.orgRoleHolder.create({ data: { companyId: c.id, roleId: role.id, name: "Seat 1", userId: second.id, sort: 0 } });
  await db.routingRule.create({ data: { companyId: c.id, key: "safety", type: "safety", keywords: [], ownerRoleId: role.id, sort: 0 } });
  await db.companyCalendar.create({ data: { companyId: c.id } });
  await db.companyConfig.create({ data: { companyId: c.id, notifications: true } });
  // The agreements check (Q9.4): the DPA, and no works council.
  await recordAgreement(c.id, manager.id, { kind: "dpa", status: "signed", date: "2026-11-02", signer: "Managing director" });
  await recordAgreement(c.id, manager.id, { kind: "works", status: "notNeeded", reason: "No works council" });
  ids[slug] = { companyId: c.id, managerId: manager.id };
}

const asAdmin = (slug: string): Viewer => ({
  userId: ids[slug].managerId, companyId: ids[slug].companyId, companySlug: slug, name: "m", handle: null, role: "manager", epoch: 0, issuedAt: 0,
});
const stageOf = async (slug: string) => db.company.findUniqueOrThrow({ where: { slug }, select: { stage: true, sessionEpoch: true } });
const stageAudits = (slug: string) => db.auditEvent.findMany({ where: { companyId: ids[slug].companyId, action: "audit.company.stage" } });

beforeAll(async () => {
  await db.company.deleteMany({});
  await make("pil-sb", "sandbox");
  await make("pil-pilot", "pilot");
  await make("pil-demo", "demo");
  await make("pil-live", "live");
  await make("pil-job", "sandbox");
});

beforeEach(() => {
  viewer = null;
  mocks.mail = { configured: true, reachable: true };
  mocks.backup = { at: new Date(), offbox: true };
});

afterAll(async () => {
  vi.unstubAllGlobals();
  await db.company.deleteMany({ where: { slug: { in: SLUGS } } });
  await db.$disconnect();
});

describe("PIL stage move", () => {
  it("refuses a non-admin", async () => {
    expect(await moveStageAction("pil-sb", "pilot")).toEqual({ ok: false, reason: "forbidden" });
    expect(await checkGoLiveAction("pil-sb")).toEqual({ ok: false, reason: "forbidden" });
  });

  it("a failing check refuses the move and changes nothing", async () => {
    viewer = asAdmin("pil-sb");
    mocks.backup = null; // unknown blocks like needs
    const r = await moveStageAction("pil-sb", "pilot");
    expect(r.ok).toBe(false);
    if (!r.ok) {
      expect(r.reason).toBe("blocked");
      expect(r.checks?.find((c) => c.key === "backups")?.state).toBe("unknown");
    }
    expect(await stageOf("pil-sb")).toEqual({ stage: "sandbox", sessionEpoch: 0 });
    expect(await stageAudits("pil-sb")).toHaveLength(0);
    expect(await db.notifyPreference.count({ where: { companyId: ids["pil-sb"].companyId } })).toBe(0);
  });

  it("reminders and the digest off refuse the move to pilot, though they do not block Open (Q9.7)", async () => {
    viewer = asAdmin("pil-sb");
    const where = { companyId: ids["pil-sb"].companyId };
    await db.companyConfig.update({ where, data: { notifications: false } });
    try {
      const r = await moveStageAction("pil-sb", "pilot");
      expect(r).toMatchObject({ ok: false, reason: "blocked" });
      if (!r.ok) expect(r.checks?.find((c) => c.key === "notifications")).toMatchObject({ level: "recommended", pilot: true, state: "needs" });
      expect(await stageOf("pil-sb")).toEqual({ stage: "sandbox", sessionEpoch: 0 });
    } finally {
      await db.companyConfig.update({ where, data: { notifications: true } });
    }
  });

  it("all green moves to pilot with an audit row, no epoch change and the managers as recipients", async () => {
    viewer = asAdmin("pil-sb");
    const checked = await checkGoLiveAction("pil-sb");
    expect(checked.ok && checked.checks.filter((c) => c.level === "needed").every((c) => c.state === "done")).toBe(true);

    expect(await moveStageAction("pil-sb", "pilot")).toEqual({ ok: true, stage: "pilot" });
    expect(await stageOf("pil-sb")).toEqual({ stage: "pilot", sessionEpoch: 0 });
    const audits = await stageAudits("pil-sb");
    expect(audits).toHaveLength(1);
    expect(audits[0]).toMatchObject({ actorKind: "admin", actorUserId: ids["pil-sb"].managerId, source: "settings" });
    expect(audits[0].changes).toEqual({ stage: { before: "sandbox", after: "pilot" } });

    const prefs = await db.notifyPreference.findMany({ where: { companyId: ids["pil-sb"].companyId, template: "pilot.report" } });
    expect(prefs.every((p) => p.on)).toBe(true);
    const active = await db.user.findMany({ where: { companyId: ids["pil-sb"].companyId, role: "manager", active: true }, select: { id: true } });
    expect(prefs.map((p) => p.userId).sort()).toEqual(active.map((u) => u.id).sort());

    const moves = await stageMoves(ids["pil-sb"].companyId);
    expect(moves[0]).toMatchObject({ from: "sandbox", to: "pilot", actorUserId: ids["pil-sb"].managerId });
  });

  it("pilot back to sandbox bumps the epoch, needs no checks, and keeps the recipients", async () => {
    viewer = asAdmin("pil-sb");
    mocks.backup = null;
    mocks.mail = { configured: false, reachable: null };
    expect(await moveStageAction("pil-sb", "sandbox")).toEqual({ ok: true, stage: "sandbox" });
    expect(await stageOf("pil-sb")).toEqual({ stage: "sandbox", sessionEpoch: 1 });
    expect(await db.notifyPreference.count({ where: { companyId: ids["pil-sb"].companyId, template: "pilot.report" } })).toBe(2);
    expect(await stageAudits("pil-sb")).toHaveLength(2);

    // Back in pilot a second time: the rows exist, so none are added and an `off` stays off.
    mocks.mail = { configured: true, reachable: true };
    mocks.backup = { at: new Date(), offbox: true };
    await db.notifyPreference.updateMany({ where: { companyId: ids["pil-sb"].companyId, template: "pilot.report" }, data: { on: false } });
    expect(await moveStageAction("pil-sb", "pilot")).toEqual({ ok: true, stage: "pilot" });
    expect((await stageOf("pil-sb")).sessionEpoch).toBe(1);
    expect(await db.notifyPreference.count({ where: { companyId: ids["pil-sb"].companyId, template: "pilot.report", on: true } })).toBe(0);
  });

  it("demo and live are refused, and so is everything but sandbox <-> pilot", async () => {
    viewer = asAdmin("pil-demo");
    expect(await moveStageAction("pil-demo", "pilot")).toEqual({ ok: false, reason: "refused" });
    expect(await moveStageAction("pil-demo", "sandbox")).toEqual({ ok: false, reason: "refused" });
    expect(await stageOf("pil-demo")).toEqual({ stage: "demo", sessionEpoch: 0 });

    viewer = asAdmin("pil-live");
    expect(await moveStageAction("pil-live", "pilot")).toEqual({ ok: false, reason: "refused" });
    expect(await moveStageAction("pil-live", "sandbox")).toEqual({ ok: false, reason: "refused" });
    expect(await stageOf("pil-live")).toEqual({ stage: "live", sessionEpoch: 0 });

    viewer = asAdmin("pil-pilot");
    expect(await moveStageAction("pil-pilot", "live")).toEqual({ ok: false, reason: "refused" });
    expect(await moveStageAction("pil-pilot", "demo")).toEqual({ ok: false, reason: "refused" });
    expect(await stageOf("pil-pilot")).toEqual({ stage: "pilot", sessionEpoch: 0 });
  });

  it("a set_stage job from pilot to live keeps sessions; back to sandbox signs out", async () => {
    process.env.OPS_URL = "https://admin.test";
    process.env.OPS_TOKEN = "stack-token";
    process.env.AUTH_SECRET ||= "a-test-secret-of-some-length-0123456789";
    await db.company.update({ where: { slug: "pil-job" }, data: { stage: "pilot" } });
    let jobs: unknown[] = [];
    vi.stubGlobal(
      "fetch",
      vi.fn(async (_url: string, init?: RequestInit) =>
        init?.method === "POST" ? new Response("{}", { status: 200 }) : new Response(JSON.stringify({ contractVersion: 1, jobs }), { status: 200 }),
      ),
    );
    jobs = [{ id: "pil-j1", action: "set_stage", slug: "pil-job", stage: "live" }];
    await pullPlatformJobs();
    expect(await stageOf("pil-job")).toEqual({ stage: "live", sessionEpoch: 0 });
    const audits = await stageAudits("pil-job");
    expect(audits).toHaveLength(1);
    expect(audits[0].changes).toEqual({ stage: { before: "pilot", after: "live" } });

    // Live is locked for jobs; the sign-out leg runs from pilot.
    await db.company.update({ where: { slug: "pil-job" }, data: { stage: "pilot" } });
    jobs = [{ id: "pil-j2", action: "set_stage", slug: "pil-job", stage: "sandbox" }];
    await pullPlatformJobs();
    expect(await stageOf("pil-job")).toEqual({ stage: "sandbox", sessionEpoch: 1 });
  });
});
