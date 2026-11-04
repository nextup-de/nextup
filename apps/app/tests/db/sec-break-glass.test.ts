import { createHash } from "node:crypto";
import { mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";
import { afterAll, afterEach, beforeAll, beforeEach, describe, expect, it, vi } from "vitest";
import { ADMIN_COOKIE } from "@/features/auth/cookie";
import { getDb } from "@/lib/db/client";

// A cookie jar: the real issueAdminSession and consoleCompany run against it.
const jar = new Map<string, string>();
vi.mock("next/headers", () => ({
  headers: async () => new Headers({ "x-forwarded-for": "203.0.113.50" }),
  cookies: async () => ({
    get: (n: string) => (jar.has(n) ? { value: jar.get(n)! } : undefined),
    set: (n: string, v: string) => void jar.set(n, v),
    delete: (n: string) => void jar.delete(n),
  }),
}));
vi.mock("next/cache", () => ({ revalidatePath: () => {} }));
vi.mock("next/navigation", () => ({
  redirect: (to: string) => {
    throw new Error(`REDIRECT ${to}`);
  },
}));

const { adminSignIn } = await import("@/server/actions/admin");
const { consoleCompany } = await import("@/server/console-guard");
const { forgive } = await import("@/server/throttle");

const db = getDb();
const SHARED = "shared-admin-code-for-demo-boxes-9z";
const SECRET = "sec-break-glass-secret-0123456789abcdef";
const NOW = new Date("2026-11-16T10:00:00Z");
const dir = mkdtempSync(path.join(tmpdir(), "bg-"));
const env = { ...process.env };
let companyId = "";

const form = (code: string) => {
  const f = new FormData();
  f.set("code", code);
  return f;
};
const sha = (c: string) => createHash("sha256").update(c).digest("hex");
const writeWindow = (code: string, openedAt: string, until: string) =>
  writeFileSync(path.join(dir, "window.json"), JSON.stringify({ v: 1, codeSha256: sha(code), openedAt, until, by: "op", reason: "test" }));
const signIn = (code: string) => adminSignIn({}, form(code)).then((r) => r.error ?? "ok", (e: Error) => e.message);
const rows = () => db.auditEvent.findMany({ where: { companyId, action: "audit.access.break_glass" } });

beforeAll(async () => {
  await db.company.deleteMany({});
  companyId = (await db.company.create({ data: { slug: "sec-bg", name: "Sec BG", stage: "pilot", seedJson: {} } })).id;
});

beforeEach(async () => {
  vi.useFakeTimers({ toFake: ["Date"] });
  vi.setSystemTime(NOW);
  jar.clear();
  forgive("adminLogin", "203.0.113.50");
  process.env.AUTH_SECRET = SECRET;
  process.env.ADMIN_ACCESS_CODE = SHARED;
  process.env.TENANT_MODE = "single";
  process.env.COMPANY_SLUG = "sec-bg";
  process.env.BREAK_GLASS_DIR = dir;
  rmSync(path.join(dir, "window.json"), { force: true });
  await db.company.update({ where: { id: companyId }, data: { stage: "pilot" } });
  await db.auditEvent.deleteMany({ where: { companyId } });
});

afterEach(() => {
  vi.useRealTimers();
  for (const k of ["AUTH_SECRET", "ADMIN_ACCESS_CODE", "TENANT_MODE", "COMPANY_SLUG", "BREAK_GLASS_DIR"]) {
    if (env[k] === undefined) delete process.env[k];
    else process.env[k] = env[k];
  }
});

afterAll(async () => {
  await db.company.deleteMany({});
  await db.$disconnect();
  rmSync(dir, { recursive: true, force: true });
});

describe("SEC break-glass sign-in", () => {
  it("refuses ADMIN_ACCESS_CODE on a pilot company, with or without a window", async () => {
    expect(await signIn(SHARED)).not.toMatch(/^REDIRECT/);
    writeWindow("window-code-1", "2026-11-16T09:00:00Z", "2026-11-16T12:00:00Z");
    expect(await signIn(SHARED)).not.toMatch(/^REDIRECT/);
    expect(jar.has(ADMIN_COOKIE)).toBe(false);
    expect(await rows()).toHaveLength(0);
  });

  it("signs in with the window's code, writes one row, and ends the session when the window closes", async () => {
    writeWindow("window-code-1", "2026-11-16T09:00:00Z", "2026-11-16T12:00:00Z");
    expect(await signIn("window-code-1")).toMatch(/^REDIRECT/);
    const all = await rows();
    expect(all).toHaveLength(1);
    expect(all[0]).toMatchObject({ actorKind: "break-glass", changes: { until: "2026-11-16T12:00:00.000Z" } });
    expect(JSON.stringify(all)).not.toContain("window-code-1");
    expect((await consoleCompany())?.via).toBe("break-glass");

    rmSync(path.join(dir, "window.json"));
    expect(await consoleCompany()).toBeNull();
    expect(jar.has(ADMIN_COOKIE)).toBe(false);
  });

  it("ends the session when the window expires", async () => {
    writeWindow("window-code-1", "2026-11-16T09:00:00Z", "2026-11-16T12:00:00Z");
    await signIn("window-code-1");
    vi.setSystemTime(new Date("2026-11-16T12:00:01Z"));
    expect(await consoleCompany()).toBeNull();
  });

  it("ends the session when another window replaces it", async () => {
    writeWindow("window-code-1", "2026-11-16T09:00:00Z", "2026-11-16T12:00:00Z");
    await signIn("window-code-1");
    writeWindow("window-code-2", "2026-11-16T10:00:00Z", "2026-11-16T13:00:00Z");
    expect(await consoleCompany()).toBeNull();
  });

  it("refuses a wrong code and an expired window's code, and writes no row", async () => {
    writeWindow("window-code-1", "2026-11-16T07:00:00Z", "2026-11-16T09:00:00Z");
    expect(await signIn("window-code-1")).not.toMatch(/^REDIRECT/);
    writeWindow("window-code-1", "2026-11-16T09:00:00Z", "2026-11-16T12:00:00Z");
    expect(await signIn("not-the-code")).not.toMatch(/^REDIRECT/);
    expect(await rows()).toHaveLength(0);
  });

  it("still signs in with ADMIN_ACCESS_CODE on a demo company", async () => {
    await db.company.update({ where: { id: companyId }, data: { stage: "demo" } });
    expect(await signIn(SHARED)).toMatch(/^REDIRECT/);
    expect((await consoleCompany())?.via).toBe("break-glass");
    expect(await rows()).toHaveLength(1);
  });
});
