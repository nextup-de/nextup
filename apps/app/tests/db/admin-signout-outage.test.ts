// When the database cannot say whether /admin signed everyone out, a cookie opens nothing; signing out
// still ends the cookie and holds in this process.
import { afterAll, afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { ADMIN_COOKIE, signAdmin } from "@/features/auth/cookie";
import { getDb } from "@/lib/db/client";

const control = vi.hoisted(() => ({ fail: false }));
vi.mock("@/lib/db/admin-revocation", async (importOriginal) => {
  const real = await importOriginal<typeof import("@/lib/db/admin-revocation")>();
  const down = () => Promise.reject(new Error("database down"));
  return {
    loadAdminRevokedAt: () => (control.fail ? down() : real.loadAdminRevokedAt()),
    saveAdminRevokedAt: (seconds: number) => (control.fail ? down() : real.saveAdminRevokedAt(seconds)),
  };
});

const SECRET = "admin-signout-outage-secret-0123456789";
let cookie: string | undefined;
vi.mock("next/headers", () => ({
  headers: async () => new Headers(),
  cookies: async () => ({
    get: (n: string) => (n === ADMIN_COOKIE && cookie ? { value: cookie } : undefined),
    set: () => {},
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

const { adminSignOut, isAdmin } = await import("@/server/actions/admin");

const db = getDb();
const env = { ...process.env };
const memory = globalThis as unknown as { __nextupAdminRevokedAt?: number };
const fresh = (secondsAgo = 0) => {
  vi.useFakeTimers({ toFake: ["Date"], now: Date.now() - secondsAgo * 1000 });
  const signed = signAdmin(Math.floor(Date.now() / 1000) + 3600, SECRET, "Kim", false, "stack-admin");
  vi.useRealTimers();
  return signed;
};

beforeEach(async () => {
  process.env.AUTH_SECRET = SECRET;
  process.env.TENANT_MODE = "path";
  delete process.env.COMPANY_SLUG;
  control.fail = false;
  delete memory.__nextupAdminRevokedAt;
  await db.$executeRaw`DELETE FROM "AdminRevocation"`;
});

afterEach(() => {
  vi.restoreAllMocks();
  for (const k of ["AUTH_SECRET", "TENANT_MODE", "COMPANY_SLUG"]) {
    if (env[k] === undefined) delete process.env[k];
    else process.env[k] = env[k];
  }
});

afterAll(async () => {
  delete memory.__nextupAdminRevokedAt;
  await db.$executeRaw`DELETE FROM "AdminRevocation"`;
  await db.$disconnect();
});

describe("the sign-out watermark when the database is down", () => {
  it("a cookie opens nothing while the watermark cannot be read", async () => {
    const warn = vi.spyOn(console, "warn").mockImplementation(() => {});
    cookie = fresh();
    expect(await isAdmin()).toBe(true);
    control.fail = true;
    expect(await isAdmin()).toBe(false);
    expect(warn).toHaveBeenCalled();
  });

  it("signing out ends the cookie and holds in this process, and does not throw", async () => {
    const warn = vi.spyOn(console, "warn").mockImplementation(() => {});
    const copied = fresh(60);
    cookie = copied;
    expect(await isAdmin()).toBe(true);
    // The check before the write reads the database, so only the write fails here.
    const save = await import("@/lib/db/admin-revocation");
    vi.spyOn(save, "saveAdminRevokedAt").mockRejectedValueOnce(new Error("database down"));
    await adminSignOut().catch((e: unknown) => {
      if (!(e instanceof Error && "redirected" in e)) throw e;
    });
    expect(cookie).toBeUndefined();
    cookie = copied;
    expect(await isAdmin()).toBe(false);
    expect(warn).toHaveBeenCalled();
  });
});
