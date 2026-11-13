// Q9.1 and Q9.4 on a real Postgres: "We do not use this" on setup (a stack admin only) and the Agreements card on
// Go-live (a company admin only). Both are audit rows; the retention run keeps them. No relay, no backup volume.
import { afterAll, beforeAll, beforeEach, describe, expect, it, vi } from "vitest";
import type { Viewer } from "@/features/auth/session";
import { SEED } from "@/features/demo/seed";

let viewer: Viewer | null = null;
vi.mock("@/features/auth/session", () => ({ getViewerFor: vi.fn(async (slug: string) => (viewer && viewer.companySlug === slug ? viewer : null)) }));
vi.mock("next/cache", () => ({ revalidatePath: vi.fn() }));
vi.mock("@/server/mail", () => ({ mailStatus: vi.fn(async () => ({ configured: true, reachable: true })), sendMail: vi.fn(async () => ({ ok: true })), mailConfigured: () => true }));
vi.mock("@/server/backup-status", () => ({ readBackupStatus: vi.fn(async () => ({ at: new Date(), offbox: true })) }));

import { getDb } from "@/lib/db/client";
import { loadDeclined } from "@/lib/db/declined";
import { loadAgreements } from "@/lib/db/agreements";
import { runRetention } from "@/lib/db/retention";
import { declineSystemAction, reopenSystemAction } from "@/server/actions/settings/declined";
import { recordAgreementAction } from "@/server/actions/settings/agreements";

const db = getDb();
const SLUG = "setup-declined";
const ids: Record<string, string> = {};
let companyId = "";
const as = (who: "manager" | "itAdmin" | "member"): Viewer => ({
  userId: ids[who], companyId, companySlug: SLUG, name: who, handle: null, role: who === "manager" ? "manager" : "member", epoch: 0, issuedAt: 0,
});

beforeAll(async () => {
  process.env.TENANT_MODE = "single";
  process.env.COMPANY_SLUG = SLUG;
  await db.company.deleteMany({});
  const c = await db.company.create({ data: { slug: SLUG, name: "Setup Declined", stage: "sandbox", seedJson: JSON.parse(JSON.stringify(SEED)) } });
  companyId = c.id;
  const mk = async (key: string, role: string, isStackAdmin = false) => {
    ids[key] = (await db.user.create({ data: { companyId, name: key, email: `${key}@x.example`, role, isStackAdmin, active: true } })).id;
  };
  await mk("manager", "manager");
  await mk("itAdmin", "member", true);
  await mk("member", "member");
});

beforeEach(() => {
  viewer = null;
});

afterAll(async () => {
  delete process.env.TENANT_MODE;
  delete process.env.COMPANY_SLUG;
  await db.company.deleteMany({});
  await db.$disconnect();
});

describe("We do not use this", () => {
  it("is for a stack admin only", async () => {
    expect(await declineSystemAction(SLUG, "jira", "SAP PS")).toEqual({ ok: false, reason: "forbidden" });
    viewer = as("member");
    expect(await declineSystemAction(SLUG, "jira", "SAP PS")).toEqual({ ok: false, reason: "forbidden" });
    viewer = as("manager");
    expect(await declineSystemAction(SLUG, "jira", "SAP PS")).toEqual({ ok: false, reason: "forbidden" });
    expect(await db.auditEvent.count({ where: { companyId, action: "audit.connector.declined" } })).toBe(0);
  });

  it("needs a known system and a one-line reason", async () => {
    viewer = as("itAdmin");
    expect(await declineSystemAction(SLUG, "sap", "no")).toEqual({ ok: false, reason: "system" });
    expect(await declineSystemAction(SLUG, "jira", "   ")).toEqual({ ok: false, reason: "reason" });
  });

  it("writes audit.connector.declined with the system and the reason, and reopening clears it", async () => {
    viewer = as("itAdmin");
    expect(await declineSystemAction(SLUG, "jira", "Projects stay\nin SAP PS")).toEqual({ ok: true });
    expect(await declineSystemAction(SLUG, "teams", "Mail is enough")).toEqual({ ok: true });
    const row = await db.auditEvent.findFirstOrThrow({ where: { companyId, action: "audit.connector.declined", targetId: "jira" } });
    expect(row).toMatchObject({ actorKind: "admin", actorUserId: ids.itAdmin, targetKind: "connector", source: "settings" });
    expect(row.changes).toEqual({ system: "jira", reason: "Projects stay in SAP PS" });
    expect(Object.keys(await loadDeclined(companyId)).sort()).toEqual(["jira", "teams"]);

    expect(await reopenSystemAction(SLUG, "jira")).toEqual({ ok: true });
    expect(await db.auditEvent.findFirstOrThrow({ where: { companyId, action: "audit.connector.reopened" } })).toMatchObject({ targetId: "jira", changes: { system: "jira" } });
    expect(Object.keys(await loadDeclined(companyId))).toEqual(["teams"]);
    // Reopening what is not declined writes nothing.
    expect(await reopenSystemAction(SLUG, "jira")).toEqual({ ok: true });
    expect(await db.auditEvent.count({ where: { companyId, action: "audit.connector.reopened" } })).toBe(1);
  });
});

describe("Agreements", () => {
  it("is for a company admin only", async () => {
    viewer = as("itAdmin");
    expect(await recordAgreementAction(SLUG, { kind: "dpa", status: "signed", date: "2026-11-02", signer: "CEO" })).toEqual({ ok: false, reason: "forbidden" });
  });

  it("refuses what the card would refuse", async () => {
    viewer = as("manager");
    expect(await recordAgreementAction(SLUG, { kind: "dpa", status: "notNeeded", reason: "trust" })).toEqual({ ok: false, reason: "status" });
    expect(await recordAgreementAction(SLUG, { kind: "dpa", status: "signed", date: "2999-01-01", signer: "CEO" })).toEqual({ ok: false, reason: "future" });
    expect(await db.auditEvent.count({ where: { companyId, action: "audit.company.agreement" } })).toBe(0);
  });

  it("records an agreement, and the newest record of a kind wins", async () => {
    viewer = as("manager");
    expect(await recordAgreementAction(SLUG, { kind: "works", status: "signed", date: "2026-10-30", signer: "Works council chair" })).toEqual({ ok: true });
    expect(await recordAgreementAction(SLUG, { kind: "works", status: "notNeeded", reason: "No works council" })).toEqual({ ok: true });
    expect((await loadAgreements(companyId)).works).toMatchObject({ status: "notNeeded", reason: "No works council" });
  });
});

describe("retention", () => {
  it("keeps the decisions and the agreements past the audit log's two years", async () => {
    const old = new Date(Date.now() - 800 * 86_400_000);
    await db.auditEvent.updateMany({ where: { companyId }, data: { at: old } });
    await db.auditEvent.create({ data: { companyId, actorKind: "system", actorUserId: null, action: "audit.settings.rules", targetKind: null, targetId: null, changes: {}, source: "settings", at: old } });
    await runRetention(companyId, new Date());
    const left = await db.auditEvent.findMany({ where: { companyId, at: old }, select: { action: true } }); // the run writes a row of its own, today
    expect(left.map((r) => r.action)).not.toContain("audit.settings.rules");
    expect(new Set(left.map((r) => r.action))).toEqual(new Set(["audit.connector.declined", "audit.connector.reopened", "audit.company.agreement"]));
    expect(Object.keys(await loadDeclined(companyId))).toEqual(["teams"]);
    expect((await loadAgreements(companyId)).works?.status).toBe("notNeeded");
  });
});
