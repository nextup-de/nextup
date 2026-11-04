// Signing out of /admin ends every admin cookie issued before it, also a copied one and also after a
// restart: the watermark is in the database, not only in this process's memory.
import { afterAll, afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { ADMIN_COOKIE, ADMIN_TTL_SECONDS } from "@/features/auth/cookie";
import { getDb } from "@/lib/db/client";

const SECRET = "admin-signout-restart-secret-0123456789";
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

const { adminSignOut, isAdmin } = await import("@/server/actions/admin");
const { issueAdminSession, supportBy } = await import("@/server/admin-session");
const { openGrant } = await import("@/lib/db/support-grants");

const db = getDb();
const SLUG = "signout-co";
const env = { ...process.env };
let companyId = "";
const memory = globalThis as unknown as { __nextupAdminRevokedAt?: number };

/** What a restart does to this process: the in-memory watermark is gone. */
const restart = () => {
  delete memory.__nextupAdminRevokedAt;
};
const nowSeconds = () => Math.floor(Date.now() / 1000);
async function signOut() {
  await adminSignOut().catch((e: unknown) => {
    if (!(e instanceof Error && "redirected" in e)) throw e;
  });
}
const clearWatermark = () => db.$executeRaw`DELETE FROM "AdminRevocation"`;

beforeEach(async () => {
  process.env.AUTH_SECRET = SECRET;
  process.env.TENANT_MODE = "single";
  process.env.COMPANY_SLUG = SLUG;
  process.env.BREAK_GLASS_DIR = "/nonexistent-break-glass";
  cookie = undefined;
  restart();
  await clearWatermark().catch(() => undefined);
  await db.company.deleteMany({});
  companyId = (await db.company.create({ data: { slug: SLUG, name: "Signout", stage: "pilot", seedJson: {} } })).id;
});

afterEach(() => {
  vi.useRealTimers();
  for (const k of ["AUTH_SECRET", "TENANT_MODE", "COMPANY_SLUG", "BREAK_GLASS_DIR"]) {
    if (env[k] === undefined) delete process.env[k];
    else process.env[k] = env[k];
  }
});

afterAll(async () => {
  restart();
  await clearWatermark().catch(() => undefined);
  await db.company.deleteMany({});
  await db.$disconnect();
});

/** A session issued a minute ago, so the sign-out that follows clearly comes after it. */
async function sessionFromAMinuteAgo(): Promise<string> {
  vi.useFakeTimers({ toFake: ["Date"], now: Date.now() - 60_000 });
  await issueAdminSession("Kim", false, "stack-admin");
  vi.useRealTimers();
  return cookie!;
}

describe("signing out of /admin", () => {
  it("ends a copied cookie now", async () => {
    const copied = await sessionFromAMinuteAgo();
    expect(await isAdmin()).toBe(true);
    await signOut();
    expect(cookie).toBeUndefined();
    cookie = copied;
    expect(await isAdmin()).toBe(false);
  });

  it("still ends it after a restart", async () => {
    const copied = await sessionFromAMinuteAgo();
    await signOut();
    restart();
    cookie = copied;
    expect(await isAdmin()).toBe(false);
  });

  it("lets a new sign-in through", async () => {
    await sessionFromAMinuteAgo();
    await signOut();
    await issueAdminSession("Kim", false, "stack-admin");
    expect(await isAdmin()).toBe(true);
  });

  it("does not lock out a short support session that started after it", async () => {
    await sessionFromAMinuteAgo();
    await signOut();
    const { grant } = await openGrant(companyId, { hours: 1, openedBy: "Kim", actor: { kind: "console", userId: null }, source: "console" });
    await issueAdminSession(supportBy(grant.id), false, "support", grant.expiresAt);
    expect(await isAdmin()).toBe(true);
  });

  it("is not moved by someone who is not signed in", async () => {
    const valid = await sessionFromAMinuteAgo();
    cookie = undefined;
    await signOut();
    restart();
    cookie = valid;
    expect(await isAdmin()).toBe(true);
  });

  it("treats a cookie from before this change by its expiry", async () => {
    const before = Buffer.from(JSON.stringify({ v: 1, admin: true, exp: nowSeconds() + ADMIN_TTL_SECONDS - 60, by: "Kim", via: "stack-admin" })).toString("base64url");
    await sessionFromAMinuteAgo();
    await signOut();
    // Signed with the real key, without iat: issued a minute ago by its expiry, so it is refused.
    const { createHmac } = await import("node:crypto");
    cookie = `${before}.${createHmac("sha256", SECRET).update(before).digest("base64url")}`;
    expect(await isAdmin()).toBe(false);
  });
});
