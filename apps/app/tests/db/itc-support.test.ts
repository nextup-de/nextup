import { afterAll, beforeAll, beforeEach, afterEach, describe, expect, it, vi } from "vitest";
import { ADMIN_COOKIE, signAdmin } from "@/features/auth/cookie";
import { getDb } from "@/lib/db/client";

const SECRET = "itc-support-test-secret-0123456789";
let cookie: string | undefined;
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

const { openSupportAccess, revokeSupportAccess, supportSignIn } = await import("@/server/actions/support-access");
const { setConsoleM365 } = await import("@/server/actions/console-connectors");
const { consoleCompany } = await import("@/server/console-guard");
const { forgive } = await import("@/server/throttle");

const db = getDb();
const SLUG = "acme";
let companyId = "";
const exp = () => Math.floor(Date.now() / 1000) + 3600;
const env = { ...process.env };
const asAdmin = () => (cookie = signAdmin(exp(), SECRET, "Kim", false, "stack-admin"));

/** Signs in with the code; success ends in a redirect, which the mock turns into a throw. */
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

beforeAll(async () => {
  await db.company.deleteMany({});
  await db.supportGrant.deleteMany({});
  companyId = (await db.company.create({ data: { slug: SLUG, name: "Acme", seedJson: {} } })).id;
});

beforeEach(async () => {
  process.env.AUTH_SECRET = SECRET;
  process.env.TENANT_MODE = "single";
  process.env.COMPANY_SLUG = SLUG;
  cookie = undefined;
  await db.supportGrant.deleteMany({});
  // clientKey() has no address behind it in a test: all attempts share one key.
  forgive("adminLogin", "unknown");
});

afterEach(() => {
  process.env.TENANT_MODE = env.TENANT_MODE;
  process.env.COMPANY_SLUG = env.COMPANY_SLUG;
  process.env.AUTH_SECRET = env.AUTH_SECRET;
});

afterAll(async () => {
  await db.supportGrant.deleteMany({});
  await db.company.deleteMany({});
  await db.$disconnect();
});

describe("ITC support access", () => {
  it("a stack admin opens one grant and the code is not stored in clear", async () => {
    asAdmin();
    const r = await openSupportAccess();
    expect(r.ok).toBe(true);
    if (!r.ok) return;
    expect(r.supportCode).toMatch(/^[A-HJ-NP-Z2-9]{12}$/);
    const rows = await db.supportGrant.findMany({ where: { companyId } });
    expect(rows).toHaveLength(1);
    expect(JSON.stringify(rows[0])).not.toContain(r.supportCode);
    const hours = (rows[0].expiresAt.getTime() - rows[0].createdAt.getTime()) / 3_600_000;
    expect(Math.round(hours)).toBe(24);
  });

  it("a second open revokes the first", async () => {
    asAdmin();
    const a = await openSupportAccess();
    const b = await openSupportAccess();
    expect(a.ok && b.ok).toBe(true);
    const rows = await db.supportGrant.findMany({ where: { companyId }, orderBy: { createdAt: "asc" } });
    expect(rows).toHaveLength(2);
    expect(rows[0].revokedAt).not.toBeNull();
    expect(rows[1].revokedAt).toBeNull();
    if (a.ok) expect((await signIn(a.supportCode)).redirected).toBe(false);
  });

  it("support signs in with the code, read-only, and the sign-in is logged", async () => {
    asAdmin();
    const r = await openSupportAccess();
    if (!r.ok) throw new Error("not opened");
    const info = vi.spyOn(console, "info").mockImplementation(() => {});
    expect((await signIn(r.supportCode)).redirected).toBe(true);
    expect(info).toHaveBeenCalledWith(expect.stringMatching(/^\[admin\] support \d{4}-\d\d-\d\dT/));
    info.mockRestore();
    const c = await consoleCompany();
    expect(c?.via).toBe("support");
    expect(c?.supportUntil).toBeInstanceOf(Date);
    expect(await setConsoleM365(true)).toEqual({ ok: false, code: "support-read-only" });
    const row = await db.supportGrant.findFirstOrThrow({ where: { companyId } });
    expect(row.signins).toHaveLength(1);
    // A support session cannot open or revoke access itself.
    expect(await openSupportAccess()).toEqual({ ok: false, code: "not-allowed" });
    expect(await revokeSupportAccess()).toEqual({ ok: false, code: "not-allowed" });
  });

  it("after revoke the code opens nothing, and a live session ends", async () => {
    asAdmin();
    const r = await openSupportAccess();
    if (!r.ok) throw new Error("not opened");
    await signIn(r.supportCode);
    const session = cookie;
    asAdmin();
    expect(await revokeSupportAccess()).toEqual({ ok: true });
    cookie = session;
    expect(await consoleCompany()).toBeNull();
    const again = await signIn(r.supportCode);
    expect(again.redirected).toBe(false);
    expect(again.error).toBeTruthy();
    expect(cookie).toBeUndefined();
  });

  it("after expiry the code opens nothing", async () => {
    asAdmin();
    const r = await openSupportAccess();
    if (!r.ok) throw new Error("not opened");
    await db.supportGrant.updateMany({ where: { companyId }, data: { expiresAt: new Date(Date.now() - 1000) } });
    const res = await signIn(r.supportCode);
    expect(res.redirected).toBe(false);
    expect(res.error).toBeTruthy();
    expect(cookie).toBeUndefined();
  });

  it("a break-glass session cannot open a grant", async () => {
    cookie = signAdmin(exp(), SECRET, undefined, true, "break-glass");
    expect(await openSupportAccess()).toEqual({ ok: false, code: "not-allowed" });
    expect(await db.supportGrant.count({ where: { companyId } })).toBe(0);
  });
});
