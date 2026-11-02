// GDP-R1: the retention run and the screenshot switch against a real Postgres (D16, D17).
import { afterAll, beforeAll, describe, expect, it, vi } from "vitest";
import type { Viewer } from "@/features/auth/session";
import { SEED } from "@/features/demo/seed";
import { toSeedJson } from "@/features/demo/parse";
import { getDb } from "@/lib/db/client";

let viewer: Viewer | null = null;
vi.mock("@/features/auth/session", () => ({ getViewerFor: vi.fn(async (slug: string) => (viewer && viewer.companySlug === slug ? viewer : null)) }));
vi.mock("next/cache", () => ({ revalidatePath: vi.fn() }));
vi.mock("@/server/tickets-sync", () => ({ syncTickets: vi.fn(async () => undefined) }));

import { runRetention, loadRetention } from "@/lib/db/retention";
import { loadAssistSettings } from "@/lib/db/assist";
import { runRetentionOnce } from "@/server/scheduler/retention";
import { reportTicket } from "@/server/actions/tickets";

const db = getDb();
const DAY = 86_400_000;
// Mid-day, so "today's 03:00" is behind it whatever the server's zone.
const now = new Date("2026-11-03T12:00:00");
const ago = (days: number) => new Date(now.getTime() - days * DAY);

type Co = { id: string; slug: string };
let acme: Co;
let globex: Co;

async function seedRows(c: Co) {
  const user = await db.user.create({ data: { companyId: c.id, name: "J. Schmidt", email: `u@${c.slug}.test`, role: "member" } });
  await db.assistTurn.createMany({
    data: [
      { companyId: c.id, userId: user.id, sessionId: "s", role: "user", text: "old", createdAt: ago(31) },
      { companyId: c.id, userId: user.id, sessionId: "s", role: "user", text: "new", createdAt: ago(29) },
    ],
  });
  const draft = async (status: string, age: number) => {
    const d = await db.ideaDraft.create({ data: { companyId: c.id, userId: user.id, status } });
    await db.$executeRaw`UPDATE "IdeaDraft" SET "updatedAt" = ${ago(age)} WHERE "id" = ${d.id}`;
  };
  await draft("draft", 31); // goes
  await draft("draft", 29);
  await draft("published", 400); // never

  const view = (caseId: string, open: boolean) =>
    db.caseView.create({ data: { companyId: c.id, caseId, kind: "idea", status: open ? "open" : "closed", open, dueDay: 0, lastDay: 0, lastSeq: 0 } });
  const event = (id: string, caseId: string, age: number) =>
    db.caseEvent.create({ data: { id, companyId: c.id, ts: ago(age), day: 0, type: "case.raised", actor: "x", targetId: caseId, payload: {} } });
  await view(`${c.slug}-closed-old`, false);
  await event(`${c.slug}-e1`, `${c.slug}-closed-old`, 400);
  await event(`${c.slug}-e2`, `${c.slug}-closed-old`, 370);
  await view(`${c.slug}-open-old`, true);
  await event(`${c.slug}-e3`, `${c.slug}-open-old`, 500);
  await view(`${c.slug}-closed-recent`, false);
  await event(`${c.slug}-e4`, `${c.slug}-closed-recent`, 500);
  await event(`${c.slug}-e5`, `${c.slug}-closed-recent`, 100);

  const audit = (action: string, age: number) =>
    db.auditEvent.create({ data: { companyId: c.id, at: ago(age), actorKind: "admin", action, changes: {}, source: "settings" } });
  await audit("audit.member.role", 731);
  await audit("audit.member.role", 700);

  await db.dataExport.create({ data: { companyId: c.id, kind: "company", requestedByUserId: user.id, deliverTo: "admin", status: "ready", file: Buffer.from("zip"), sizeBytes: 3, expiresAt: ago(1) } });
  await db.dataExport.create({ data: { companyId: c.id, kind: "company", requestedByUserId: user.id, deliverTo: "admin", status: "ready", file: Buffer.from("zip"), sizeBytes: 3, expiresAt: new Date(now.getTime() + DAY) } });

  await db.retentionRule.createMany({
    data: [
      { companyId: c.id, kind: "assist_turns", keepDays: 30 },
      { companyId: c.id, kind: "idea_drafts", keepDays: 30 },
      { companyId: c.id, kind: "closed_cases", keepDays: 360 },
    ],
  });
}

const snapshot = async (c: Co) => ({
  turns: await db.assistTurn.count({ where: { companyId: c.id } }),
  drafts: await db.ideaDraft.count({ where: { companyId: c.id } }),
  views: await db.caseView.count({ where: { companyId: c.id } }),
  events: await db.caseEvent.count({ where: { companyId: c.id } }),
  audit: await db.auditEvent.count({ where: { companyId: c.id } }),
  files: await db.dataExport.count({ where: { companyId: c.id, file: { not: null } } }),
});

beforeAll(async () => {
  await db.company.deleteMany({});
  acme = await db.company.create({ data: { slug: "acme", name: "Acme", stage: "pilot", seedJson: toSeedJson(SEED) as object } });
  globex = await db.company.create({ data: { slug: "globex", name: "Globex", stage: "pilot", seedJson: toSeedJson(SEED) as object } });
});

afterAll(async () => {
  await db.company.deleteMany({});
  await db.$disconnect();
});

describe("GDP retention run", () => {
  it("deletes only what is past its rule, records totals and one audit row, and does nothing twice", async () => {
    await seedRows(acme);
    await seedRows(globex);
    const globexBefore = await snapshot(globex);

    const totals = await runRetention(acme.id, now);
    expect(totals).toEqual({ assistTurns: 1, drafts: 1, cases: 1, events: 2, auditEvents: 1, exports: 1 });

    expect(await snapshot(globex)).toEqual(globexBefore); // another company is untouched
    expect(await snapshot(acme)).toEqual({ turns: 1, drafts: 2, views: 2, events: 3, audit: 2, files: 1 });
    expect((await db.caseView.findMany({ where: { companyId: acme.id } })).map((v) => v.caseId).sort()).toEqual(["acme-closed-recent", "acme-open-old"]);
    expect(await db.caseEvent.count({ where: { companyId: acme.id, targetId: "acme-open-old" } })).toBe(1);
    expect(await db.caseEvent.count({ where: { companyId: acme.id, targetId: "acme-closed-recent" } })).toBe(2);
    expect(await db.ideaDraft.count({ where: { companyId: acme.id, status: "published" } })).toBe(1);
    expect(await db.dataExport.count({ where: { companyId: acme.id, status: "expired", file: null } })).toBe(1);

    const run = await loadRetention(acme.id);
    expect(run.lastRun?.removed).toEqual(totals);
    const rows = await db.auditEvent.findMany({ where: { companyId: acme.id, action: "audit.privacy.retention_run" } });
    expect(rows).toHaveLength(1);
    expect(rows[0]).toMatchObject({ actorKind: "system", actorUserId: null, source: "scheduler", changes: totals });

    // The scheduler runs the company once; a second pass the same day changes nothing.
    const after = await snapshot(acme);
    expect(await runRetentionOnce(now)).toContain("acme");
    const once = await snapshot(acme);
    expect(await runRetentionOnce(new Date(now.getTime() + 3_600_000))).toEqual([]);
    expect(await snapshot(acme)).toEqual(once);
    expect(once.turns).toBe(after.turns);
    expect(once.events).toBe(after.events);
  });

  it("reads the assist_turns rule as retentionDays", async () => {
    expect((await loadAssistSettings(acme.id)).retentionDays).toBe(30);
    await db.retentionRule.deleteMany({ where: { companyId: acme.id, kind: "assist_turns" } });
    expect((await loadAssistSettings(acme.id)).retentionDays).toBe(90);
  });
});

describe("GDP report screenshots", () => {
  const PNG = "data:image/png;base64," + Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a, 0, 0, 0, 0]).toString("base64");
  const report = { kind: "bug", impact: "annoying", description: "It broke", expected: "", context: { path: "/x", userAgent: "t", viewport: "1x1", consoleErrors: [], failedRequests: [] }, screenshot: PNG };

  async function reporter(slug: string) {
    const c = await db.company.create({ data: { slug, name: slug, stage: "pilot", seedJson: toSeedJson(SEED) as object } });
    const u = await db.user.create({ data: { companyId: c.id, name: "J. Schmidt", email: `u@${slug}.test`, role: "member" } });
    viewer = { userId: u.id, companyId: c.id, companySlug: slug, name: "J", handle: null, role: "member", epoch: 0, issuedAt: 0 };
    return c;
  }

  it("stores the ticket without its screenshot when the company switched it off", async () => {
    const c = await reporter("shots-off");
    await db.privacyPolicy.create({ data: { companyId: c.id, reportScreenshots: false } });
    expect(await reportTicket("shots-off", report)).toMatchObject({ ok: true });
    const t = await db.ticket.findFirstOrThrow({ where: { companyId: c.id } });
    expect(t.screenshot).toBeNull();
    expect(t.screenshotMime).toBeNull();
  });

  it("keeps the screenshot when the company has no policy row", async () => {
    const c = await reporter("shots-default");
    expect(await reportTicket("shots-default", report)).toMatchObject({ ok: true });
    const t = await db.ticket.findFirstOrThrow({ where: { companyId: c.id } });
    expect(t.screenshot).not.toBeNull();
    expect(t.screenshotMime).toBe("image/png");
  });
});
