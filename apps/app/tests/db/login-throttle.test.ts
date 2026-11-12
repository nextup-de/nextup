// The company-wide login limit (loginCodeAll) is there to slow down guessing, so it counts wrong codes only: a
// rollout morning with more right codes than the limit must not lock the company out of its own login.
import { afterAll, beforeAll, beforeEach, describe, expect, it, vi } from "vitest";
import { generateLoginCode, hashLoginCode } from "@/features/auth/login-code";
import { getDb } from "@/lib/db/client";

let address = "198.51.100.1";
vi.mock("@/server/issue-session", () => ({ issueSession: vi.fn(async () => {}), clearSession: vi.fn(), secureCookies: () => false }));
vi.mock("next/headers", () => ({
  headers: async () => new Headers({ "x-forwarded-for": address }),
  cookies: async () => ({ get: () => undefined, set: () => {}, delete: () => {} }),
}));
vi.mock("next/cache", () => ({ revalidatePath: () => {} }));
vi.mock("next/navigation", () => ({
  redirect: (to: string) => {
    throw new Error(`REDIRECT ${to}`);
  },
}));

const { codeLogin } = await import("@/server/actions/auth");
const { forgive, RULES } = await import("@/server/throttle");

const db = getDb();
const SLUG = "login-throttle";
let code = "";

const attempt = async (c: string): Promise<string> => {
  const f = new FormData();
  f.set("slug", SLUG);
  f.set("code", c);
  try {
    const r = await codeLogin({}, f);
    return r.error ?? "no error";
  } catch (e) {
    return (e as Error).message;
  }
};
const signedIn = (outcome: string) => outcome.startsWith("REDIRECT ");

beforeAll(async () => {
  process.env.AUTH_SECRET = "test-secret-test-secret-test-secret-0123456789";
  await db.company.deleteMany({});
  const c = await db.company.create({ data: { openedAt: new Date(), slug: SLUG, name: "Login Throttle", seedJson: {} } });
  code = generateLoginCode(SLUG);
  await db.user.create({ data: { companyId: c.id, name: "member", email: "member@x.example", role: "member", loginCodeHash: hashLoginCode(code) } });
});

beforeEach(async () => {
  await forgive("loginCodeAll", SLUG);
});

afterAll(async () => {
  await db.company.deleteMany({});
  await db.$disconnect();
});

describe("loginCodeAll", () => {
  it("right codes from many addresses never use it up", async () => {
    const limit = RULES.loginCodeAll.limit;
    for (let i = 0; i < limit + 50; i++) {
      address = `198.51.100.${i % 250}`;
      expect(signedIn(await attempt(code)), `login ${i + 1}`).toBe(true);
    }
  });

  it("wrong codes from many addresses still close it, for right codes too", async () => {
    const limit = RULES.loginCodeAll.limit;
    const wrong = generateLoginCode(SLUG);
    address = "203.0.113.250";
    const wrongCode = await attempt(wrong);
    expect(signedIn(wrongCode)).toBe(false);
    for (let i = 1; i < limit; i++) {
      address = `203.0.113.${i % 250}`;
      expect(await attempt(wrong)).toBe(wrongCode);
    }
    address = "192.0.2.77";
    const blocked = await attempt(code);
    expect(signedIn(blocked)).toBe(false);
    expect(blocked).not.toBe(wrongCode); // the limit answered, not the code check
  });
});
