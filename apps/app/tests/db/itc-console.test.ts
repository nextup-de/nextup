import { afterAll, beforeAll, beforeEach, afterEach, describe, expect, it, vi } from "vitest";
import { ADMIN_COOKIE, signAdmin } from "@/features/auth/cookie";
import { getDb } from "@/lib/db/client";

const SECRET = "itc-console-test-secret-0123456789";
let cookie: string | undefined;
vi.mock("next/headers", () => ({
  headers: async () => new Headers(),
  cookies: async () => ({ get: (n: string) => (n === ADMIN_COOKIE && cookie ? { value: cookie } : undefined), set: () => {}, delete: () => {} }),
}));

const { consoleCompany } = await import("@/server/console-guard");

const db = getDb();
const SLUG = "acme";
let companyId = "";
const exp = () => Math.floor(Date.now() / 1000) + 3600;
const env = { ...process.env };

beforeAll(async () => {
  await db.company.deleteMany({});
  companyId = (await db.company.create({ data: { slug: SLUG, name: "Acme", seedJson: {} } })).id;
});

beforeEach(() => {
  process.env.AUTH_SECRET = SECRET;
  process.env.TENANT_MODE = "single";
  process.env.COMPANY_SLUG = SLUG;
  cookie = undefined;
});

afterEach(() => {
  process.env.TENANT_MODE = env.TENANT_MODE;
  process.env.COMPANY_SLUG = env.COMPANY_SLUG;
  process.env.AUTH_SECRET = env.AUTH_SECRET;
});

afterAll(async () => {
  await db.company.deleteMany({});
  await db.$disconnect();
});

describe("ITC console guard", () => {
  it("returns the own company and the way in for a signed admin cookie", async () => {
    cookie = signAdmin(exp(), SECRET, "kim@acme.example", false, "entra");
    expect(await consoleCompany()).toEqual({ companyId, slug: SLUG, via: "entra" });
    cookie = signAdmin(exp(), SECRET, "Kim", false, "stack-admin");
    expect((await consoleCompany())?.via).toBe("stack-admin");
    cookie = signAdmin(exp(), SECRET, undefined, true, "break-glass");
    expect((await consoleCompany())?.via).toBe("break-glass");
  });

  it("returns null without the admin cookie or with a forged one", async () => {
    expect(await consoleCompany()).toBeNull();
    cookie = signAdmin(exp(), "another-secret-another-secret-0", "x", false, "entra");
    expect(await consoleCompany()).toBeNull();
  });

  it("returns null in multi-tenant mode", async () => {
    cookie = signAdmin(exp(), SECRET, "kim@acme.example", false, "entra");
    process.env.TENANT_MODE = "multi";
    expect(await consoleCompany()).toBeNull();
  });
});
