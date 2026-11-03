// GDP-B1: the audit page's loader and the CSV export, against a real Postgres.
import { afterAll, beforeAll, beforeEach, describe, expect, it, vi } from "vitest";
import type { Viewer } from "@/features/auth/session";
import { getDb } from "@/lib/db/client";
import { appendAudit } from "@/lib/db/audit";

let viewer: Viewer | null = null;
vi.mock("@/features/auth/session", () => ({ getViewerFor: vi.fn(async (slug: string) => (viewer && viewer.companySlug === slug ? viewer : null)) }));

import { loadAuditPage } from "@/server/actions/settings/audit";
import { GET } from "@/app/[company]/(app)/settings/audit/export/route";
import { parseCursor } from "@/features/audit/view";

const db = getDb();
const ids: Record<string, { companyId: string; userId: string }> = {};

const asViewer = (key: string, slug: string, role: Viewer["role"]): Viewer => ({
  userId: ids[key].userId, companyId: ids[key].companyId, companySlug: slug, name: key, handle: null, role, epoch: 0, issuedAt: 0,
});

beforeAll(async () => {
  await db.company.deleteMany({});
  for (const slug of ["gav-acme", "gav-globex"]) {
    const c = await db.company.create({ data: { slug, name: slug, seedJson: {} } });
    const mk = async (key: string, role: string) => {
      const u = await db.user.create({ data: { companyId: c.id, name: key, email: `${key}@x.example`, role } });
      ids[key] = { companyId: c.id, userId: u.id };
    };
    if (slug === "gav-acme") {
      await mk("acmeManager", "manager");
      await mk("acmeMember", "member");
      await mk("acmeTarget", "member");
    } else {
      await mk("globexManager", "manager");
    }
  }
  const base = Date.now() - 3 * 24 * 3600 * 1000;
  for (let i = 0; i < 60; i++) {
    await appendAudit({
      companyId: ids.acmeManager.companyId, actorKind: "admin", actorUserId: ids.acmeManager.userId, action: "audit.member.role",
      targetKind: "member", targetId: ids.acmeTarget.userId, changes: { role: { before: "member", after: "leader" } }, source: "settings",
    });
  }
  // Spread the times so newest-first is checkable.
  const rows = await db.auditEvent.findMany({ where: { companyId: ids.acmeManager.companyId }, orderBy: { id: "asc" } });
  for (const [i, r] of rows.entries()) await db.auditEvent.update({ where: { id: r.id }, data: { at: new Date(base + i * 1000) } });
  for (let i = 0; i < 3; i++) {
    await appendAudit({
      companyId: ids.globexManager.companyId, actorKind: "system", actorUserId: null, action: "audit.privacy.retention_run",
      targetKind: null, targetId: null, changes: {}, source: "scheduler",
    });
  }
});

beforeEach(() => { viewer = null; });

afterAll(async () => {
  await db.company.deleteMany({});
  await db.$disconnect();
});

describe("GDP audit page", () => {
  it("gives a company admin 50 rows then 10, newest first, and none of another company", async () => {
    viewer = asViewer("acmeManager", "gav-acme", "manager");
    const first = await loadAuditPage("gav-acme", { period: "30d" });
    expect(first?.rows).toHaveLength(50);
    expect(first?.total).toBe(60);
    expect(first?.next).toBeTruthy();
    const times = first!.rows.map((r) => r.at);
    expect([...times].sort().reverse()).toEqual(times);
    const second = await loadAuditPage("gav-acme", { period: "30d", cursor: first!.next! });
    expect(second?.rows).toHaveLength(10);
    expect(second?.next).toBeNull();
    expect(parseCursor(first!.next!)).not.toBeNull();
    expect(second!.rows[0].at <= first!.rows[49].at).toBe(true);
    const all = [...first!.rows, ...second!.rows];
    expect(new Set(all.map((r) => r.id)).size).toBe(60);
    expect(all.some((r) => r.actorKind === "system")).toBe(false);
  });

  it("hides the total when one person is filtered", async () => {
    viewer = asViewer("acmeManager", "gav-acme", "manager");
    const page = await loadAuditPage("gav-acme", { period: "30d", actorUserId: ids.acmeManager.userId });
    expect(page?.total).toBeNull();
    expect(page?.rows).toHaveLength(50);
    expect(page?.people.map((p) => p.id)).toEqual([ids.acmeManager.userId]);
  });

  it("shows a pseudonymised person under the label in old rows", async () => {
    await db.user.update({ where: { id: ids.acmeTarget.userId, companyId: ids.acmeTarget.companyId }, data: { name: "Former member #1234" } });
    viewer = asViewer("acmeManager", "gav-acme", "manager");
    const page = await loadAuditPage("gav-acme", { period: "30d" });
    expect(page?.names[ids.acmeTarget.userId]).toBe("Former member #1234");
    expect(page?.rows[0].targetId).toBe(ids.acmeTarget.userId);
  });

  it("gives a member and another company's manager nothing", async () => {
    viewer = asViewer("acmeMember", "gav-acme", "member");
    expect(await loadAuditPage("gav-acme", { period: "30d" })).toBeNull();
    viewer = asViewer("globexManager", "gav-globex", "manager");
    expect(await loadAuditPage("gav-acme", { period: "30d" })).toBeNull();
    viewer = { ...asViewer("globexManager", "gav-globex", "manager") };
    const own = await loadAuditPage("gav-globex", { period: "30d" });
    expect(own?.rows).toHaveLength(3);
  });

  it("exports the filtered rows as CSV and records the export", async () => {
    viewer = asViewer("acmeManager", "gav-acme", "manager");
    const before = await db.auditEvent.count({ where: { companyId: ids.acmeManager.companyId, action: "audit.privacy.audit_exported" } });
    const res = await GET(new Request("http://x/gav-acme/settings/audit/export?area=member"), { params: Promise.resolve({ company: "gav-acme" }) });
    expect(res.status).toBe(200);
    expect(res.headers.get("content-type")).toContain("text/csv");
    expect(res.headers.get("content-disposition")).toMatch(/gav-acme-audit-\d{4}-\d{2}-\d{2}\.csv/);
    const lines = (await res.text()).split("\r\n").filter(Boolean);
    expect(lines[0]).toBe("at,actorKind,actor,action,targetKind,target,changes");
    expect(lines).toHaveLength(61);
    const row = await db.auditEvent.findFirstOrThrow({ where: { companyId: ids.acmeManager.companyId, action: "audit.privacy.audit_exported" } });
    expect(row.changes).toEqual({ rows: { before: null, after: 60 } });
    expect(await db.auditEvent.count({ where: { companyId: ids.acmeManager.companyId, action: "audit.privacy.audit_exported" } })).toBe(before + 1);

    viewer = asViewer("acmeMember", "gav-acme", "member");
    const denied = await GET(new Request("http://x/gav-acme/settings/audit/export"), { params: Promise.resolve({ company: "gav-acme" }) });
    expect(denied.status).toBe(404);
  });
});
