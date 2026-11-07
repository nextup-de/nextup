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

const { adminSignIn, setEntraTenantAction, issueLoginCodesAction, setStackAdminAction } = await import("@/server/actions/admin");

const { adminResetTotpAction } = await import("@/server/actions/settings/totp-reset");

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
    // The shared code works on a demo stage only (SEC/D6); the later actions do not depend on the stage.
    await db.company.update({ where: { id: acme }, data: { stage: "demo" } });
    await expect(adminSignIn({}, form({ code: ADMIN_CODE }))).rejects.toMatchObject({ redirected: expect.any(String) });
    await db.company.update({ where: { id: acme }, data: { stage: "sandbox" } });
    let all = await rows();
    expect(all).toHaveLength(1);
    expect(all[0]).toMatchObject({ action: "audit.access.break_glass", actorKind: "break-glass", actorUserId: null, source: "console", changes: {} });

    // The stack-admin session does the rest.
    cookie = signAdmin(exp(), SECRET, "Kim Becker", false, "stack-admin");
    expect(await setEntraTenantAction({}, form({ slug: "acme", tenantId: TENANT }))).toMatchObject({ saved: true });
    const issued = await issueLoginCodesAction({}, form({ slug: "acme", userId }));
    expect(issued.codes?.[0]?.code).toBeTruthy();
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
    expect(text).not.toContain(issued.codes?.[0]?.code as string);
    expect(text).not.toContain(hash);
  });

  it("a bulk action writes one row per person, and a selection with a stranger in it changes nobody", async () => {
    cookie = signAdmin(exp(), SECRET, "Kim Becker", false, "stack-admin");
    const second = (await db.user.create({ data: { companyId: acme, name: "Lea Vogel", email: "lea.vogel@acme-gdp-k1.test", role: "member", dept: "", ini: "LV" } })).id;
    const many = (fields: Record<string, string>, ids: string[]) => {
      const f = form(fields);
      for (const id of ids) f.append("userId", id);
      return f;
    };
    const before = (await rows()).length;

    const refused = await issueLoginCodesAction({}, many({ slug: "acme" }, [second, "not-a-person"]));
    expect(refused.error).toBeTruthy();
    expect((await db.user.findFirstOrThrow({ where: { id: second, companyId: acme } })).loginCodeHash).toBeNull();
    expect(await rows()).toHaveLength(before);

    const issued = await issueLoginCodesAction({}, many({ slug: "acme" }, [userId, second]));
    expect(issued.codes?.map((c) => c.name)).toEqual(["Kim Becker", "Lea Vogel"]);
    expect(new Set(issued.codes?.map((c) => c.code)).size).toBe(2);
    expect(await setStackAdminAction({}, many({ slug: "acme", stackAdmin: "on" }, [userId, second]))).toMatchObject({ saved: true });
    expect((await db.user.findFirstOrThrow({ where: { id: second, companyId: acme } })).isStackAdmin).toBe(true);

    const added = (await rows()).slice(before).map((r) => r.action);
    expect(added.filter((a) => a === "audit.member.code")).toHaveLength(2);
    expect(added.filter((a) => a === "audit.access.stack_admin")).toHaveLength(2);
  });

  it("resetting second factors is all or nothing, and audited per person", async () => {
    cookie = signAdmin(exp(), SECRET, "Kim Becker", false, "stack-admin");
    const enrolled = (await db.user.create({ data: { companyId: acme, name: "Mo Enrolled", email: "mo@acme-gdp-k1.test", role: "manager", dept: "", ini: "ME", totpSecretSealed: "sealed", totpEnabledAt: new Date() } })).id;
    const never = (await db.user.create({ data: { companyId: acme, name: "Nia Never", email: "nia@acme-gdp-k1.test", role: "member", dept: "", ini: "NN" } })).id;
    const before = (await rows()).length;
    const select = (ids: string[]) => {
      const f = form({ slug: "acme" });
      for (const id of ids) f.append("userId", id);
      return f;
    };

    expect((await adminResetTotpAction({}, select([enrolled, never]))).error).toBeTruthy();
    expect((await db.user.findFirstOrThrow({ where: { id: enrolled, companyId: acme } })).totpEnabledAt).not.toBeNull();
    expect(await rows()).toHaveLength(before);

    expect(await adminResetTotpAction({}, select([enrolled]))).toMatchObject({ saved: true });
    expect((await db.user.findFirstOrThrow({ where: { id: enrolled, companyId: acme } })).totpSecretSealed).toBeNull();
    expect((await rows()).slice(before).map((r) => r.action)).toEqual(["audit.member.totp_reset"]);
  });
});
