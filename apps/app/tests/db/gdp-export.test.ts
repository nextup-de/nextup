// GDP-X1: requesting, delivering and downloading data exports, against a real Postgres.
import { afterAll, beforeAll, beforeEach, describe, expect, it, vi } from "vitest";
import type { Viewer } from "@/features/auth/session";
import { toSeedJson } from "@/features/demo/parse";
import { SEED } from "@/features/demo/seed";

let viewer: Viewer | null = null;
const flags = vi.hoisted(() => ({ failAudit: false }));
vi.mock("@/lib/db/audit", async (orig) => {
  const m = await orig<typeof import("@/lib/db/audit")>();
  return { ...m, appendAudit: ((...a: Parameters<typeof m.appendAudit>) => (flags.failAudit ? Promise.reject(new Error("down")) : m.appendAudit(...a))) as typeof m.appendAudit };
});
vi.mock("@/features/auth/session", () => ({ getViewerFor: vi.fn(async (slug: string) => (viewer && viewer.companySlug === slug ? viewer : null)) }));

import { getDb } from "@/lib/db/client";
import { exportFile, listExports } from "@/lib/db/privacy-export";
import { requestExport } from "@/server/actions/privacy-export";
import { GET } from "@/app/api/[company]/exports/[id]/route";

const db = getDb();
const A = "gdp-x-a";
const B = "gdp-x-b";
type Co = { id: string; slug: string; manager: string; manager2: string; member: string; leaver: string; plain: string };
const co: Record<"a" | "b", Co> = { a: null as never, b: null as never };

const as = (c: Co, userId: string, role: Viewer["role"]): Viewer => ({
  userId, companyId: c.id, companySlug: c.slug, name: "Shown", handle: null, role, epoch: 0, issuedAt: 0,
});

async function makeCompany(slug: string): Promise<Co> {
  const c = await db.company.create({ data: { slug, name: `Co ${slug}`, stage: "pilot", seedJson: toSeedJson(SEED) as object } });
  await db.companyConfig.create({ data: { companyId: c.id, notifications: true } });
  const mk = (name: string, role: string, mail: string, extra: object = {}) =>
    db.user.create({ data: { companyId: c.id, name, email: `${mail}@${slug}.example`, role, ...extra }, select: { id: true } });
  const verified = { entraOid: `oid-${slug}`, directorySyncedAt: new Date(), employeeId: `E-${slug}` };
  const manager = await mk("Mara Manager", "manager", "mara");
  const manager2 = await mk("Manu Manager", "manager", "manu");
  const member = await mk("Mia Member", "member", "mia", verified);
  const leaver = await mk("Leo Leaver", "member", "leo", { active: false });
  const plain = await mk("Pia Plain", "member", "pia");
  return { id: c.id, slug, manager: manager.id, manager2: manager2.id, member: member.id, leaver: leaver.id, plain: plain.id };
}

const req = (c: Co, id: string) => GET(new Request("http://x.test"), { params: Promise.resolve({ company: c.slug, id }) });
const auditOf = (companyId: string, action: string) => db.auditEvent.findMany({ where: { companyId, action } });

beforeAll(async () => {
  await db.company.deleteMany({ where: { slug: { in: [A, B] } } });
  co.a = await makeCompany(A);
  co.b = await makeCompany(B);
});
beforeEach(() => { viewer = null; });
afterAll(async () => {
  await db.company.deleteMany({ where: { slug: { in: [A, B] } } });
  await db.$disconnect();
});

describe("GDP export", () => {
  it("a manager exports the company: ready, sized, valid for 7 days, one audit row, no D5 data", async () => {
    viewer = as(co.a, co.a.manager, "manager");
    const r = await requestExport(A, { kind: "company", deliverTo: "admin" });
    expect(r.ok).toBe(true);
    if (!r.ok) return;
    const [row] = await listExports(co.a.id);
    expect(row).toMatchObject({ id: r.id, status: "ready", kind: "company", deliverTo: "admin" });
    expect(row.sizeBytes).toBeGreaterThan(0);
    expect("file" in row).toBe(false);
    const days = (row.expiresAt.getTime() - row.createdAt.getTime()) / 86_400_000;
    expect(days).toBeGreaterThan(6.99);
    expect(days).toBeLessThan(7.01);
    expect(await auditOf(co.a.id, "audit.privacy.exported")).toHaveLength(1);

    const res = await req(co.a, r.id);
    expect(res.status).toBe(200);
    expect(res.headers.get("content-type")).toBe("application/json");
    expect(res.headers.get("cache-control")).toBe("no-store");
    expect(res.headers.get("content-disposition")).toMatch(/^attachment; filename=gdp-x-a-export-\d{4}-\d{2}-\d{2}\.json$/);
    const text = await res.text();
    expect(JSON.parse(text)).toMatchObject({ format: "nextup-export", kind: "company" });
    expect(text).not.toContain(`E-${A}`);
    expect(text).not.toContain(`oid-${A}`);
    expect(await auditOf(co.a.id, "audit.privacy.downloaded")).toHaveLength(1);
  });

  it("a copy for an active member with a verified address enqueues one mail: pending in pilot, skipped in sandbox", async () => {
    viewer = as(co.a, co.a.manager, "manager");
    const r = await requestExport(A, { kind: "person", subjectUserId: co.a.member, deliverTo: "person" });
    expect(r.ok).toBe(true);
    if (!r.ok) return;
    const mails = await db.outboxMessage.findMany({ where: { companyId: co.a.id, template: "privacy.export" } });
    expect(mails).toHaveLength(1);
    expect(mails[0]).toMatchObject({ key: `export:${r.id}`, channel: "mail", status: "pending", recipientUserId: co.a.member, address: `mia@${A}.example` });
    expect(mails[0].link).toMatch(new RegExp(`/exports/${r.id}$`));
    expect(mails[0].text).toContain(`/exports/${r.id}`);

    await db.company.update({ where: { id: co.a.id }, data: { stage: "sandbox" } });
    try {
      const r2 = await requestExport(A, { kind: "person", subjectUserId: co.a.member, deliverTo: "person" });
      expect(r2.ok).toBe(true);
      if (!r2.ok) return;
      const m2 = await db.outboxMessage.findFirstOrThrow({ where: { companyId: co.a.id, key: `export:${r2.id}` } });
      expect(m2.status).toBe("skipped");
      expect(m2.lastError).toBe("sandbox");
    } finally {
      await db.company.update({ where: { id: co.a.id }, data: { stage: "pilot" } });
    }
  });

  it("refuses delivery to an unverified address or an inactive member, and holds an admin-only copy only with a reason", async () => {
    viewer = as(co.a, co.a.manager, "manager");
    const before = await db.outboxMessage.count({ where: { companyId: co.a.id, template: "privacy.export" } });
    expect((await requestExport(A, { kind: "person", subjectUserId: co.a.plain, deliverTo: "person" })).ok).toBe(false);
    expect((await requestExport(A, { kind: "person", subjectUserId: co.a.leaver, deliverTo: "person" })).ok).toBe(false);
    expect((await requestExport(A, { kind: "person", subjectUserId: co.a.leaver, deliverTo: "admin" })).ok).toBe(false); // no reason
    expect((await requestExport(A, { kind: "company", deliverTo: "person" })).ok).toBe(false);
    expect(await db.outboxMessage.count({ where: { companyId: co.a.id, template: "privacy.export" } })).toBe(before);

    const r = await requestExport(A, { kind: "person", subjectUserId: co.a.leaver, deliverTo: "admin", adminOnlyReason: "Works council request" });
    expect(r.ok).toBe(true);
    if (!r.ok) return;
    expect(await db.outboxMessage.count({ where: { companyId: co.a.id, template: "privacy.export" } })).toBe(before);
    const audit = (await auditOf(co.a.id, "audit.privacy.exported")).find((a) => (a.changes as Record<string, { after: unknown }>).exportId.after === r.id)!;
    expect(audit.targetId).toBe(co.a.leaver);
    expect(audit.changes).toMatchObject({ deliveredToSubject: { after: false }, deliverTo: { after: "admin" }, adminOnlyReason: { after: "Works council request" } });
    // the subject cannot sign in, and no one but the requester may download it
    viewer = as(co.a, co.a.manager2, "manager");
    expect((await req(co.a, r.id)).status).toBe(404);
    viewer = as(co.a, co.a.manager, "manager");
    expect((await req(co.a, r.id)).status).toBe(200);
  });

  it("gives an admin copy to the requester only and a person's copy to the subject only", async () => {
    viewer = as(co.a, co.a.manager, "manager");
    const adminCopy = await requestExport(A, { kind: "company", deliverTo: "admin" });
    const personCopy = await requestExport(A, { kind: "person", subjectUserId: co.a.member, deliverTo: "person" });
    if (!adminCopy.ok || !personCopy.ok) throw new Error("export failed");

    expect((await req(co.a, adminCopy.id)).status).toBe(200);
    expect((await req(co.a, personCopy.id)).status).toBe(404); // not even the requesting admin

    viewer = as(co.a, co.a.manager2, "manager");
    expect((await req(co.a, adminCopy.id)).status).toBe(404);

    viewer = as(co.a, co.a.member, "member");
    expect((await req(co.a, adminCopy.id)).status).toBe(404);
    const mine = await req(co.a, personCopy.id);
    expect(mine.status).toBe(200);
    const body = JSON.parse(await mine.text());
    expect(body.kind).toBe("person");
    expect(body.tables.users.map((u: { id: string }) => u.id)).toEqual([co.a.member]);
    expect(body.tables.assistTurns).toBeDefined();

    viewer = as(co.a, co.a.plain, "member");
    expect((await req(co.a, personCopy.id)).status).toBe(404);

    viewer = null;
    expect((await req(co.a, adminCopy.id)).status).toBe(404);
  });

  it("answers 410 after expiry and drops the file", async () => {
    viewer = as(co.a, co.a.manager, "manager");
    const r = await requestExport(A, { kind: "company", deliverTo: "admin" });
    if (!r.ok) throw new Error("export failed");
    await db.dataExport.update({ where: { id: r.id }, data: { expiresAt: new Date(Date.now() - 1000) } });
    expect((await req(co.a, r.id)).status).toBe(410);
    const row = await db.dataExport.findUniqueOrThrow({ where: { id: r.id } });
    expect(row.file).toBeNull();
    expect(row.status).toBe("expired");
    expect(await exportFile(co.a.id, r.id, new Date())).toBeNull();
    // a stranger still gets 404, not 410
    viewer = as(co.a, co.a.manager2, "manager");
    expect((await req(co.a, r.id)).status).toBe(404);
  });

  it("refuses a member and another company's manager, and never reads across companies", async () => {
    viewer = as(co.a, co.a.member, "member");
    expect((await requestExport(A, { kind: "company", deliverTo: "admin" })).ok).toBe(false);
    viewer = as(co.b, co.b.manager, "manager");
    expect((await requestExport(A, { kind: "company", deliverTo: "admin" })).ok).toBe(false);
    expect((await requestExport(B, { kind: "person", subjectUserId: co.a.member, deliverTo: "admin" })).ok).toBe(false); // not B's person

    const exp = await db.dataExport.findFirstOrThrow({ where: { companyId: co.a.id, status: "ready" } });
    expect((await GET(new Request("http://x.test"), { params: Promise.resolve({ company: B, id: exp.id }) })).status).toBe(404);
    viewer = as(co.b, co.b.manager, "manager");
    expect((await req(co.a, exp.id)).status).toBe(404);
  });

  it("withholds the download when the audit row cannot be written", async () => {
    viewer = as(co.a, co.a.manager, "manager");
    const r = await requestExport(A, { kind: "company", deliverTo: "admin" });
    if (!r.ok) throw new Error("export failed");
    flags.failAudit = true;
    const err = vi.spyOn(console, "error").mockImplementation(() => undefined);
    try {
      const res = await req(co.a, r.id);
      expect(res.status).toBe(500);
      expect(await res.text()).not.toContain("nextup-export");
    } finally {
      flags.failAudit = false;
      err.mockRestore();
    }
  });

  it("keeps no ready export when the audit row cannot be written", async () => {
    viewer = as(co.a, co.a.manager, "manager");
    flags.failAudit = true;
    const err = vi.spyOn(console, "error").mockImplementation(() => undefined);
    try {
      const r = await requestExport(A, { kind: "person", subjectUserId: co.a.member, deliverTo: "person" });
      expect(r.ok).toBe(false);
    } finally {
      flags.failAudit = false;
      err.mockRestore();
    }
    const [row] = await listExports(co.a.id);
    expect(row.status).toBe("failed");
    expect(await db.outboxMessage.count({ where: { companyId: co.a.id, key: `export:${row.id}` } })).toBe(0);
  });
});
