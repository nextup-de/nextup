import { afterAll, beforeAll, beforeEach, afterEach, describe, expect, it, vi } from "vitest";
import { ADMIN_COOKIE, signAdmin } from "@/features/auth/cookie";
import type { Viewer } from "@/features/auth/session";
import { getDb } from "@/lib/db/client";

const SECRET = "sec-support-access-secret-0123456789";
let cookie: string | undefined;
let viewer: Viewer | null = null;
vi.mock("next/headers", () => ({
  headers: async () => new Headers(),
  cookies: async () => ({
    get: (n: string) => (n === ADMIN_COOKIE && cookie ? { value: cookie } : undefined),
    set: (n: string, v: string) => {
      if (n === ADMIN_COOKIE) cookie = v;
    },
    delete: () => {
      cookie = undefined;
    },
  }),
}));
vi.mock("next/cache", () => ({ revalidatePath: () => {} }));
vi.mock("next/navigation", () => ({
  redirect: (to: string) => {
    throw Object.assign(new Error("redirect"), { redirected: to });
  },
  notFound: () => {
    throw new Error("notFound");
  },
}));
vi.mock("@/features/auth/session", () => ({ getViewerFor: vi.fn(async (slug: string) => (viewer && viewer.companySlug === slug ? viewer : null)) }));

const { grantSupportAction, extendSupportAction, endSupportAction } = await import("@/server/actions/settings/support");
const { openSupportAccess, supportSignIn } = await import("@/server/actions/support-access");
const { consoleCompany } = await import("@/server/console-guard");
const { grantLog } = await import("@/lib/db/support-grants");
const { forgive } = await import("@/server/throttle");

const db = getDb();
const env = { ...process.env };
const ids: Record<string, { companyId: string; userId: string }> = {};
const exp = () => Math.floor(Date.now() / 1000) + 3600;

const asViewer = (key: string, slug: string, role: Viewer["role"]): Viewer => ({
  userId: ids[key].userId, companyId: ids[key].companyId, companySlug: slug, name: key, handle: null, role, epoch: 0, issuedAt: 0,
});
async function signIn(code: string): Promise<{ redirected: boolean; error?: string }> {
  cookie = undefined;
  try {
    const r = await supportSignIn(code);
    return { redirected: false, error: r.error };
  } catch (e) {
    if (e instanceof Error && "redirected" in e) return { redirected: true };
    throw e;
  }
}
const actions = (companyId: string) =>
  db.auditEvent.findMany({ where: { companyId, action: { startsWith: "audit.access.support" } }, orderBy: [{ at: "asc" }, { id: "asc" }] });

beforeAll(async () => {
  await db.company.deleteMany({});
  for (const [slug, stage] of [["sup-a", "pilot"], ["sup-demo", "demo"]] as const) {
    const c = await db.company.create({ data: { slug, name: slug, stage, seedJson: {} } });
    for (const [key, role] of [["manager", "manager"], ["leader", "leader"]] as const) {
      const u = await db.user.create({ data: { companyId: c.id, name: `${key}-${slug}`, email: `${key}@${slug}.example`, role, active: true } });
      ids[`${key}:${slug}`] = { companyId: c.id, userId: u.id };
    }
  }
});

beforeEach(async () => {
  process.env.AUTH_SECRET = SECRET;
  process.env.TENANT_MODE = "single";
  process.env.COMPANY_SLUG = "sup-a";
  process.env.BREAK_GLASS_DIR = "/nonexistent-break-glass";
  cookie = undefined;
  viewer = null;
  await db.supportGrant.deleteMany({});
  await db.auditEvent.deleteMany({});
  forgive("adminLogin", "unknown");
});

afterEach(() => {
  for (const k of ["AUTH_SECRET", "TENANT_MODE", "COMPANY_SLUG", "BREAK_GLASS_DIR"]) {
    if (env[k] === undefined) delete process.env[k];
    else process.env[k] = env[k];
  }
});

afterAll(async () => {
  await db.supportGrant.deleteMany({});
  await db.company.deleteMany({});
  await db.$disconnect();
});

describe("SEC support access", () => {
  it("a company admin grants, NextUp signs in, the admin extends and ends; one audit row each and the session stops", async () => {
    const A = ids["manager:sup-a"];
    viewer = asViewer("manager:sup-a", "sup-a", "manager");
    const granted = await grantSupportAction("sup-a", { hours: 4, reason: "Ticket 1042" });
    expect(granted.ok).toBe(true);
    if (!granted.ok) return;
    expect(granted.code).toMatch(/^[A-HJ-NP-Z2-9]{12}$/);
    const row = await db.supportGrant.findFirstOrThrow({ where: { companyId: A.companyId } });
    expect(row).toMatchObject({ reason: "Ticket 1042", grantedById: A.userId, extendedAt: null });
    expect(JSON.stringify(row)).not.toContain(granted.code);

    // NextUp signs in with the code
    const info = vi.spyOn(console, "info").mockImplementation(() => {});
    expect((await signIn(granted.code)).redirected).toBe(true);
    info.mockRestore();
    const session = cookie;
    expect((await consoleCompany())?.via).toBe("support");

    const before = row.expiresAt;
    const ext = await extendSupportAction("sup-a", { hours: 4 });
    expect(ext.ok).toBe(true);
    const after = await db.supportGrant.findFirstOrThrow({ where: { companyId: A.companyId } });
    expect(after.expiresAt.getTime() - before.getTime()).toBe(4 * 3_600_000);
    expect(after.extendedAt).not.toBeNull();
    // never past 72 hours from now
    await extendSupportAction("sup-a", { hours: 72 });
    const capped = await db.supportGrant.findFirstOrThrow({ where: { companyId: A.companyId } });
    expect(capped.expiresAt.getTime() - Date.now()).toBeLessThanOrEqual(72 * 3_600_000);

    expect(await endSupportAction("sup-a")).toEqual({ ok: true });
    expect(await endSupportAction("sup-a")).toEqual({ ok: false, error: "settingsSupport.errNone" });

    cookie = session;
    expect(await consoleCompany()).toBeNull();
    expect((await signIn(granted.code)).redirected).toBe(false);

    const audit = await actions(A.companyId);
    expect(audit.map((r) => r.action)).toEqual([
      "audit.access.support_granted",
      "audit.access.support_signin",
      "audit.access.support_extended",
      "audit.access.support_extended",
      "audit.access.support_revoked",
    ]);
    expect(JSON.stringify(audit)).not.toContain(granted.code);

    const log = await grantLog(A.companyId);
    expect(log.rows.map((r) => r.action)).toEqual([...audit.map((r) => r.action)].reverse());
    expect(log.rows[4]).toMatchObject({ hours: 4, actorUserId: A.userId });
    expect(log.next).toBeNull();
  });

  it("refuses a bad form, a non-manager and a demo company", async () => {
    viewer = asViewer("manager:sup-a", "sup-a", "manager");
    expect(await grantSupportAction("sup-a", { hours: 8, reason: "x" })).toEqual({ ok: false, error: "settingsSupport.errHours" });
    expect(await grantSupportAction("sup-a", { hours: 4, reason: "  " })).toEqual({ ok: false, error: "settingsSupport.errReason" });
    expect(await extendSupportAction("sup-a", { hours: 4 })).toEqual({ ok: false, error: "settingsSupport.errNone" });

    viewer = asViewer("leader:sup-a", "sup-a", "leader");
    expect(await grantSupportAction("sup-a", { hours: 4, reason: "x" })).toEqual({ ok: false, error: "settingsCompany.forbidden" });
    expect(await extendSupportAction("sup-a", { hours: 4 })).toEqual({ ok: false, error: "settingsCompany.forbidden" });
    expect(await endSupportAction("sup-a")).toEqual({ ok: false, error: "settingsCompany.forbidden" });

    viewer = asViewer("manager:sup-demo", "sup-demo", "manager");
    expect(await grantSupportAction("sup-demo", { hours: 4, reason: "x" })).toEqual({ ok: false, error: "settingsSupport.errDemo" });
    expect(await db.supportGrant.count()).toBe(0);
    expect(await db.auditEvent.count({ where: { action: { startsWith: "audit.access.support" } } })).toBe(0);
  });

  it("the log pages by 20 and the console's own support access still works", async () => {
    const A = ids["manager:sup-a"];
    for (let i = 0; i < 25; i++) {
      await db.auditEvent.create({
        data: { companyId: A.companyId, actorKind: "support", actorUserId: null, action: "audit.access.support_signin", targetKind: "support_grant", targetId: "g", changes: {}, source: "console", at: new Date(Date.UTC(2026, 10, 1, 0, i)) },
      });
    }
    const p1 = await grantLog(A.companyId);
    expect(p1.rows).toHaveLength(20);
    expect(p1.next).not.toBeNull();
    const p2 = await grantLog(A.companyId, p1.next!);
    expect(p2.rows).toHaveLength(5);
    expect(p2.next).toBeNull();

    cookie = signAdmin(exp(), SECRET, "Kim", false, "stack-admin");
    const r = await openSupportAccess();
    expect(r.ok).toBe(true);
    if (!r.ok) return;
    const g = await db.supportGrant.findFirstOrThrow({ where: { companyId: A.companyId } });
    expect(Math.round((g.expiresAt.getTime() - g.createdAt.getTime()) / 3_600_000)).toBe(24);
    expect(g.reason).toBeNull();
    expect((await signIn(r.supportCode)).redirected).toBe(true);
    const granted = await db.auditEvent.findFirstOrThrow({ where: { companyId: A.companyId, action: "audit.access.support_granted" } });
    expect(granted.source).toBe("console");
  });
});
