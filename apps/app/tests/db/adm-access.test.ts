import { afterAll, afterEach, beforeAll, beforeEach, describe, expect, it, vi } from "vitest";
import { generateLoginCode, hashLoginCode } from "@/features/auth/login-code";
import { totpAt } from "@/features/auth/totp";
import { getDb } from "@/lib/db/client";

// The server actions read headers, cookies and redirect; the session writers are replaced by spies.
const issueSession = vi.fn(async () => {});
const issueAdminSession = vi.fn(async () => {});
vi.mock("@/server/issue-session", () => ({ issueSession, clearSession: vi.fn(), secureCookies: () => false }));
vi.mock("@/server/admin-session", () => ({ issueAdminSession }));
vi.mock("next/headers", () => ({
  headers: async () => new Headers({ "x-forwarded-for": "203.0.113.9" }),
  cookies: async () => ({ get: () => undefined, set: () => {}, delete: () => {} }),
}));
vi.mock("next/cache", () => ({ revalidatePath: () => {} }));
vi.mock("next/navigation", () => ({
  redirect: (to: string) => {
    throw new Error(`REDIRECT ${to}`);
  },
}));

const { codeLogin } = await import("@/server/actions/auth");
const { adminSignIn } = await import("@/server/actions/admin");
const { forgive } = await import("@/server/throttle");

const db = getDb();
const NOW = new Date("2026-11-16T10:00:00Z");
const SLUG = "adm-access";
const codes: Record<string, string> = {};
let companyId = "";

const form = (o: Record<string, string>) => {
  const f = new FormData();
  for (const [k, v] of Object.entries(o)) f.set(k, v);
  return f;
};
const login = (who: string, extra: Record<string, string> = {}) => codeLogin({}, form({ slug: SLUG, code: codes[who], ...extra }));
const landed = async (p: Promise<unknown>) => {
  try {
    await p;
  } catch (e) {
    return (e as Error).message;
  }
  return null;
};

beforeAll(async () => {
  process.env.CONNECTOR_VAULT_KEY = "ab".repeat(32);
  process.env.TENANT_MODE = "single"; // the console exists only in a one-company stack (ITC/D4, D5)
  process.env.COMPANY_SLUG = SLUG;
  process.env.AUTH_SECRET = "test-secret-test-secret-test-secret-0123456789";
  process.env.ADMIN_ACCESS_CODE = "shared-break-glass-code-9z";
  await db.company.deleteMany({});
  const c = await db.company.create({ data: { slug: SLUG, name: "Adm Access", seedJson: {} } });
  companyId = c.id;
  const mk = async (key: string, role: string, isStackAdmin = false) => {
    codes[key] = generateLoginCode(SLUG);
    await db.user.create({
      data: { companyId: c.id, name: key, email: `${key}@x.example`, role, isStackAdmin, loginCodeHash: hashLoginCode(codes[key]) },
    });
  };
  await mk("manager", "manager");
  await mk("member", "member");
  await mk("stackAdmin", "manager", true);
});

beforeEach(() => {
  vi.useFakeTimers({ toFake: ["Date"] });
  vi.setSystemTime(NOW);
  issueSession.mockClear();
  issueAdminSession.mockClear();
  forgive("adminLogin", "203.0.113.9");
  forgive("loginCode", `203.0.113.9|${SLUG}`);
});
afterEach(() => vi.useRealTimers());
afterAll(async () => {
  await db.company.deleteMany({});
  await db.$disconnect();
});

describe("ADM admin access", () => {
  it("sends a manager without TOTP to enrol, with no session; then a wrong code is refused and the right one signs in", async () => {
    const first = await login("manager");
    expect(first.step).toBe("enrol");
    expect(first.secret).toMatch(/^[A-Z2-7]{32}$/);
    expect(first.otpauth).toContain("otpauth://totp/");
    expect(issueSession).not.toHaveBeenCalled();

    const secret = first.secret!;
    const wrong = await login("manager", { secret, totp: "000000" });
    expect(wrong.error).toBeTruthy();
    expect(issueSession).not.toHaveBeenCalled();
    expect((await db.user.findFirstOrThrow({ where: { companyId, name: "manager" } })).totpEnabledAt).toBeNull();

    const right = totpAt(secret, NOW.getTime());
    expect(await landed(login("manager", { secret, totp: right }))).toMatch(/^REDIRECT/);
    expect(issueSession).toHaveBeenCalledTimes(1);
    const stored = await db.user.findFirstOrThrow({ where: { companyId, name: "manager" } });
    expect(stored.totpEnabledAt).not.toBeNull();
    expect(stored.totpSecretSealed).toBeTruthy();
    expect(stored.totpSecretSealed).not.toContain(secret);

    // Enrolled now: the code alone asks for the TOTP, a wrong one is refused, the right one signs in.
    issueSession.mockClear();
    expect((await login("manager")).step).toBe("totp");
    expect((await login("manager", { totp: "000000" })).error).toBeTruthy();
    expect(issueSession).not.toHaveBeenCalled();
    expect(await landed(login("manager", { totp: totpAt(secret, NOW.getTime()) }))).toMatch(/^REDIRECT/);
    expect(issueSession).toHaveBeenCalledTimes(1);
  });

  it("signs a member in with the code alone", async () => {
    expect(await landed(login("member"))).toMatch(/^REDIRECT/);
    expect(issueSession).toHaveBeenCalledTimes(1);
  });

  it("opens /admin for a stack admin with code and TOTP, and refuses one without", async () => {
    // Enrol the stack admin through the company login first.
    const secret = (await login("stackAdmin")).secret!;
    await landed(login("stackAdmin", { secret, totp: totpAt(secret, NOW.getTime()) }));
    issueSession.mockClear();

    expect((await adminSignIn({}, form({ code: codes.stackAdmin }))).error).toBeTruthy();
    expect((await adminSignIn({}, form({ code: codes.stackAdmin, totp: "000000" }))).error).toBeTruthy();
    expect((await adminSignIn({}, form({ code: codes.manager, totp: totpAt(secret, NOW.getTime()) }))).error).toBeTruthy();
    expect(issueAdminSession).not.toHaveBeenCalled();

    const ok = await adminSignIn({}, form({ code: codes.stackAdmin, totp: totpAt(secret, NOW.getTime()) })).catch((e: Error) => e.message);
    expect(ok).toMatch(/^REDIRECT/);
    expect(issueAdminSession).toHaveBeenCalledWith("stackAdmin", false, "stack-admin");
  });

  it("opens /admin with the shared code only as logged break-glass", async () => {
    const info = vi.spyOn(console, "info").mockImplementation(() => {});
    expect(await landed(adminSignIn({}, form({ code: process.env.ADMIN_ACCESS_CODE! })))).toMatch(/^REDIRECT/);
    expect(issueAdminSession).toHaveBeenCalledWith(undefined, true, "break-glass");
    expect(info).toHaveBeenCalledTimes(1);
    expect(info).toHaveBeenCalledWith(`[admin] break-glass ${NOW.toISOString()}`);
    info.mockRestore();
  });
});
