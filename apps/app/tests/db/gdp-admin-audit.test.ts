// GDP-K1 on the proof database: the /admin access actions write one audit row each (D12), for the
// stack's own company, and neither the admin code, a login code nor a hash reaches a row.
import { afterAll, afterEach, beforeAll, beforeEach, describe, expect, it, vi } from "vitest";
import { ADMIN_COOKIE, signAdmin } from "@/features/auth/cookie";
import { getDb } from "@/lib/db/client";

const SECRET = "gdp-admin-audit-secret-0123456789";
const ADMIN_CODE = "shared-admin-code-gdp-k1-xyz";
const TENANT = "72f988bf-86f1-41af-91ab-2d7cd011db47";
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

const { adminSignIn, setEntraTenantAction, issueLoginCodeAction, setStackAdminAction } = await import("@/server/actions/admin");

const db = getDb();
const env = { ...process.env };
const exp = () => Math.floor(Date.now() / 1000) + 3600;
let acme = "";
let userId = "";
const rows = () => db.auditEvent.findMany({ where: { companyId: acme }, orderBy: { at: "asc" } });
const form = (o: Record<string, string>) => {
  const f = new FormData();
  for (const [k, v] of Object.entries(o)) f.set(k, v);
  return f;
};

beforeAll(async () => {
  await db.company.deleteMany({});
  acme = (await db.company.create({ data: { slug: "acme", name: "Acme", stage: "sandbox", seedJson: {} } })).id;
  userId = (await db.user.create({ data: { companyId: acme, name: "Kim Becker", email: "kim.becker@acme-gdp-k1.test", role: "manager", dept: "", ini: "KB" } })).id;
});

beforeEach(() => {
  process.env.AUTH_SECRET = SECRET;
  process.env.ADMIN_ACCESS_CODE = ADMIN_CODE;
  process.env.TENANT_MODE = "single";
  process.env.COMPANY_SLUG = "acme";
  process.env.CONNECTOR_VAULT_KEY = "ab".repeat(32);
});

afterEach(() => {
  for (const k of ["AUTH_SECRET", "ADMIN_ACCESS_CODE", "TENANT_MODE", "COMPANY_SLUG", "CONNECTOR_VAULT_KEY"]) {
    if (env[k] === undefined) delete process.env[k];
    else process.env[k] = env[k];
  }
});

afterAll(async () => {
  await db.company.deleteMany({});
  await db.$disconnect();
});

describe("GDP admin audit", () => {
  it("a wrong admin code writes no row", async () => {
    cookie = undefined;
    const r = await adminSignIn({}, form({ code: "not-the-code-at-all" }));
    expect(r.error).toBeTruthy();
    expect(await rows()).toHaveLength(0);
  });

  it("each access action writes one row with the right action and actor kind, and no secret", async () => {
    cookie = undefined;
    await expect(adminSignIn({}, form({ code: ADMIN_CODE }))).rejects.toMatchObject({ redirected: expect.any(String) });
    let all = await rows();
    expect(all).toHaveLength(1);
    expect(all[0]).toMatchObject({ action: "audit.access.break_glass", actorKind: "break-glass", actorUserId: null, source: "console", changes: {} });

    // The stack-admin session does the rest.
    cookie = signAdmin(exp(), SECRET, "Kim Becker", false, "stack-admin");
    expect(await setEntraTenantAction({}, form({ slug: "acme", tenantId: TENANT }))).toMatchObject({ saved: true });
    const issued = await issueLoginCodeAction({}, form({ slug: "acme", userId }));
    expect(issued.code).toBeTruthy();
    expect(await setStackAdminAction({}, form({ slug: "acme", userId, stackAdmin: "on" }))).toMatchObject({ saved: true });

    all = await rows();
    expect(all.map((r) => r.action)).toEqual([
      "audit.access.break_glass",
      "audit.access.entra_tenant",
      "audit.member.code",
      "audit.access.stack_admin",
    ]);
    expect(all[1]).toMatchObject({ actorKind: "console", changes: { entraTenantId: { before: null, after: TENANT } } });
    expect(all[2]).toMatchObject({ actorKind: "console", targetKind: "user", targetId: userId, changes: {} });
    expect(all[3]).toMatchObject({ actorKind: "console", targetKind: "user", targetId: userId, changes: { isStackAdmin: { before: false, after: true } } });

    const hash = (await db.user.findFirstOrThrow({ where: { id: userId, companyId: acme } })).loginCodeHash ?? "";
    expect(hash).not.toBe("");
    const text = JSON.stringify(all);
    expect(text).not.toContain(ADMIN_CODE);
    expect(text).not.toContain(issued.code as string);
    expect(text).not.toContain(hash);
  });
});
