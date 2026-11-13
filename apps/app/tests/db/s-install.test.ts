// Block S, PR "install" (#655, #656, #660), against a real database:
// - Q8.5: the tenant ID of install.sh --entra-tenant-id is copied into the company once, audited as `install`.
// - Q8.1: on a company that is still closed, a NextUp.Manager's first Microsoft sign-in creates them as a
//   manager; a member is refused. The /admin Microsoft sign-in writes audit.access.console_signin.
// - Q8.6: the customer's IT confirms the hand-over on /admin/setup once the server phase is checked.
// Microsoft is played by a local key pair: the token endpoint and the signing keys are a mocked fetch.
import { generateKeyPairSync, randomUUID, sign } from "node:crypto";
import { afterAll, afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { ADMIN_COOKIE, signAdmin } from "@/features/auth/cookie";
import { FLOW_COOKIE, MICROSOFT_AUTHORITY, signFlow } from "@/features/auth/entra";
import { getDb } from "@/lib/db/client";

const SECRET = "s-install-secret-0123456789abcdef";
const jar = new Map<string, string>();
vi.mock("next/headers", () => ({
  headers: async () => new Headers({ "x-forwarded-for": "203.0.113.30" }),
  cookies: async () => ({
    get: (n: string) => (jar.has(n) ? { value: jar.get(n) as string } : undefined),
    set: (n: string, v: string) => {
      jar.set(n, v);
    },
    delete: (n: string) => {
      jar.delete(n);
    },
  }),
}));
vi.mock("next/cache", () => ({ revalidatePath: () => {} }));
vi.mock("next/navigation", () => ({
  redirect: (to: string) => {
    throw new Error(`REDIRECT ${to}`);
  },
  notFound: () => {
    throw new Error("notFound");
  },
}));
const mailStatus = vi.fn(async () => ({ configured: true, reachable: true as boolean | null }));
const readBackupStatus = vi.fn<() => Promise<{ at: Date; offbox: boolean } | null>>(async () => ({ at: new Date(), offbox: true }));
vi.mock("@/server/mail", () => ({ sendMail: vi.fn(async () => ({ ok: true })), mailStatus, mailConfigured: () => true }));
vi.mock("@/server/backup-status", () => ({ readBackupStatus }));

const { bootstrapCompany } = await import("@/lib/db/bootstrap-company");
const { finishMicrosoftLogin } = await import("@/server/microsoft-login");
const { confirmHandOverAction } = await import("@/server/actions/setup-handover");
const { loadConsoleSetupOverview } = await import("@/server/setup-overview");
const { handOverState } = await import("@/features/settings/hand-over");

const db = getDb();
const SLUG = "s-install";
const TENANT = "72f988bf-86f1-41af-91ab-2d7cd011db47";
const OTHER = "11111111-2222-3333-4444-555555555555";
const CLIENT = "aaaaaaaa-bbbb-cccc-dddd-eeeeeeeeeeee";
const ORIGIN = "https://s-install.example";
const env = { ...process.env };

const audit = (companyId: string, action: string) => db.auditEvent.findMany({ where: { companyId, action }, orderBy: { at: "asc" } });

beforeEach(async () => {
  jar.clear();
  process.env.AUTH_SECRET = SECRET;
  process.env.TENANT_MODE = "single";
  process.env.COMPANY_SLUG = SLUG;
  process.env.ENTRA_CLIENT_ID = CLIENT;
  process.env.ENTRA_CLIENT_SECRET = "client-secret";
  await db.company.deleteMany({});
});

afterEach(() => {
  vi.unstubAllGlobals();
  for (const k of ["AUTH_SECRET", "TENANT_MODE", "COMPANY_SLUG", "ENTRA_CLIENT_ID", "ENTRA_CLIENT_SECRET"]) {
    if (env[k] === undefined) delete process.env[k];
    else process.env[k] = env[k];
  }
});

afterAll(async () => {
  await db.company.deleteMany({});
  await db.$disconnect();
});

describe("Q8.5 the tenant ID from the install", () => {
  it("is copied into the new company, with audit rows whose actor is install", async () => {
    const r = await bootstrapCompany({ COMPANY_SLUG: SLUG, COMPANY_NAME: "S Install", ENTRA_TENANT_ID: TENANT.toUpperCase() });
    expect(r).toEqual({ slug: SLUG, created: true, tenant: "set" });
    const company = await db.company.findUniqueOrThrow({ where: { slug: SLUG } });
    expect(company).toMatchObject({ name: "S Install", stage: "sandbox", entraTenantId: TENANT, openedAt: null });
    expect(await db.user.count({ where: { companyId: company.id } })).toBe(0);
    const [created] = await audit(company.id, "audit.company.created");
    expect(created).toMatchObject({ actorKind: "install", actorUserId: null, source: "install", targetKind: "company", targetId: company.id });
    const [tenant] = await audit(company.id, "audit.access.entra_tenant");
    expect(tenant).toMatchObject({ actorKind: "install", source: "install", changes: { entraTenantId: { before: null, after: TENANT } } });
  });

  it("never overwrites a tenant the company already has", async () => {
    await bootstrapCompany({ COMPANY_SLUG: SLUG, ENTRA_TENANT_ID: TENANT });
    const again = await bootstrapCompany({ COMPANY_SLUG: SLUG, ENTRA_TENANT_ID: OTHER });
    expect(again).toEqual({ slug: SLUG, created: false, tenant: "kept" });
    const company = await db.company.findUniqueOrThrow({ where: { slug: SLUG } });
    expect(company.entraTenantId).toBe(TENANT);
    expect(await audit(company.id, "audit.access.entra_tenant")).toHaveLength(1);
  });

  it("fills an existing company's empty tenant once, if the console never set one", async () => {
    expect(await bootstrapCompany({ COMPANY_SLUG: SLUG })).toEqual({ slug: SLUG, created: true, tenant: "none" });
    const later = await bootstrapCompany({ COMPANY_SLUG: SLUG, ENTRA_TENANT_ID: TENANT });
    expect(later).toEqual({ slug: SLUG, created: false, tenant: "set" });
    expect((await db.company.findUniqueOrThrow({ where: { slug: SLUG } })).entraTenantId).toBe(TENANT);
  });

  it("leaves a tenant removed in the console removed", async () => {
    await bootstrapCompany({ COMPANY_SLUG: SLUG, ENTRA_TENANT_ID: TENANT });
    const company = await db.company.findUniqueOrThrow({ where: { slug: SLUG } });
    // What setEntraTenantAction does when IT empties the field.
    await db.company.update({ where: { id: company.id }, data: { entraTenantId: null } });
    await db.auditEvent.create({
      data: { companyId: company.id, actorKind: "console", action: "audit.access.entra_tenant", targetKind: "company", targetId: company.id, changes: { entraTenantId: { before: TENANT, after: null } }, source: "console" },
    });
    expect(await bootstrapCompany({ COMPANY_SLUG: SLUG, ENTRA_TENANT_ID: TENANT })).toMatchObject({ tenant: "kept" });
    expect((await db.company.findUniqueOrThrow({ where: { slug: SLUG } })).entraTenantId).toBeNull();
  });

  it("ignores a value that is no tenant ID, and does nothing without a slug", async () => {
    expect(await bootstrapCompany({ COMPANY_SLUG: SLUG, ENTRA_TENANT_ID: "not-a-guid" })).toEqual({ slug: SLUG, created: true, tenant: "invalid" });
    expect((await db.company.findUniqueOrThrow({ where: { slug: SLUG } })).entraTenantId).toBeNull();
    expect(await bootstrapCompany({ ENTRA_TENANT_ID: TENANT })).toBeNull();
  });
});

// ── Microsoft, played locally ─────────────────────────────────────────────────────────────────────

const { privateKey, publicKey } = generateKeyPairSync("rsa", { modulusLength: 2048 });
const KID = "s-install-key";
const b64 = (o: unknown) => Buffer.from(JSON.stringify(o)).toString("base64url");

function idToken(claims: Record<string, unknown>): string {
  const head = b64({ alg: "RS256", kid: KID, typ: "JWT" });
  const body = b64(claims);
  return `${head}.${body}.${sign("sha256", Buffer.from(`${head}.${body}`), privateKey).toString("base64url")}`;
}

/** One sign-in: the flow cookie as /login/microsoft sets it, Microsoft's answers, then the callback. */
async function signInWithMicrosoft(who: { roles: string[]; email: string }, as?: "admin"): Promise<string> {
  const nonce = randomUUID();
  const state = randomUUID();
  jar.set(FLOW_COOKIE, signFlow({ slug: SLUG, state, nonce, verifier: "v".repeat(43), next: "", exp: Math.floor(Date.now() / 1000) + 600, ...(as ? { as } : {}) }, SECRET));
  const token = idToken({
    aud: CLIENT, tid: TENANT, iss: `${MICROSOFT_AUTHORITY}/${TENANT}/v2.0`, nonce, exp: Math.floor(Date.now() / 1000) + 600,
    oid: randomUUID(), email: who.email, name: who.email.split("@")[0], roles: who.roles,
  });
  vi.stubGlobal("fetch", vi.fn(async (url: string) => {
    if (String(url).includes("/discovery/")) return Response.json({ keys: [{ ...publicKey.export({ format: "jwk" }), kid: KID, use: "sig" }] });
    return Response.json({ id_token: token });
  }));
  return finishMicrosoftLogin(SLUG, ORIGIN, new URLSearchParams({ code: "c", state }));
}

describe("Q8.1 the first person on a closed company comes from Entra", () => {
  beforeEach(async () => {
    await bootstrapCompany({ COMPANY_SLUG: SLUG, ENTRA_TENANT_ID: TENANT });
  });

  it("creates a NextUp.Manager as manager at their first sign-in while the company is closed", async () => {
    const company = await db.company.findUniqueOrThrow({ where: { slug: SLUG } });
    expect(company.openedAt).toBeNull();
    expect(await db.user.count({ where: { companyId: company.id } })).toBe(0);
    const to = await signInWithMicrosoft({ roles: ["NextUp.Manager"], email: "first.manager@s-install.example" });
    expect(to).toMatch(/\/setup$/);
    const user = await db.user.findFirstOrThrow({ where: { companyId: company.id, email: "first.manager@s-install.example" } });
    expect(user).toMatchObject({ role: "manager", active: true });
    expect(user.entraOid).toBeTruthy();
    expect((await db.company.findUniqueOrThrow({ where: { id: company.id } })).openedAt).toBeNull();
  });

  it("refuses a member until the company opens, and creates nobody", async () => {
    const company = await db.company.findUniqueOrThrow({ where: { slug: SLUG } });
    const to = await signInWithMicrosoft({ roles: ["NextUp.Member"], email: "early.member@s-install.example" });
    expect(to).toContain("error=closed");
    expect(await db.user.count({ where: { companyId: company.id } })).toBe(0);
  });

  it("writes audit.access.console_signin for the /admin Microsoft sign-in, naming nobody", async () => {
    const company = await db.company.findUniqueOrThrow({ where: { slug: SLUG } });
    const to = await signInWithMicrosoft({ roles: ["NextUp.Admin"], email: "it.admin@s-install.example" }, "admin");
    expect(to).toBe("/admin");
    expect(jar.has(ADMIN_COOKIE)).toBe(true);
    const rows = await audit(company.id, "audit.access.console_signin");
    expect(rows).toHaveLength(1);
    expect(rows[0]).toMatchObject({ actorKind: "console", actorUserId: null, source: "console", changes: {} });
    expect(JSON.stringify(rows[0])).not.toContain("it.admin");
  });

  it("writes no console_signin when the NextUp.Admin role is missing", async () => {
    const company = await db.company.findUniqueOrThrow({ where: { slug: SLUG } });
    const to = await signInWithMicrosoft({ roles: ["NextUp.Manager"], email: "not.admin@s-install.example" }, "admin");
    expect(to).toContain("error=noadmin");
    expect(await audit(company.id, "audit.access.console_signin")).toHaveLength(0);
  });
});

describe("Q8.6 the hand-over on /admin/setup", () => {
  let companyId = "";
  const as = (via: "entra" | "stack-admin" | "support") => jar.set(ADMIN_COOKIE, signAdmin(Math.floor(Date.now() / 1000) + 3600, SECRET, "Kim", false, via));
  const server = async () => (await loadConsoleSetupOverview({ companyId, slug: SLUG })).phases?.find((p) => p.key === "server");

  beforeEach(async () => {
    await bootstrapCompany({ COMPANY_SLUG: SLUG, ENTRA_TENANT_ID: TENANT });
    companyId = (await db.company.findUniqueOrThrow({ where: { slug: SLUG } })).id;
    mailStatus.mockResolvedValue({ configured: true, reachable: true });
    readBackupStatus.mockResolvedValue({ at: new Date(), offbox: true });
  });

  it("waits for the server phase", async () => {
    readBackupStatus.mockResolvedValue(null);
    as("entra");
    expect((await server())?.status).not.toBe("done");
    expect(await confirmHandOverAction()).toEqual({ ok: false, code: "not-ready" });
    expect(await audit(companyId, "audit.setup.handed_over")).toHaveLength(0);
  });

  it("is confirmed once by IT, and shows when and how", async () => {
    as("stack-admin");
    expect((await server())?.status).toBe("done");
    const first = await confirmHandOverAction();
    expect(first.ok).toBe(true);
    const again = await confirmHandOverAction();
    expect(again).toEqual(first);
    const rows = await audit(companyId, "audit.setup.handed_over");
    expect(rows).toHaveLength(1);
    expect(rows[0]).toMatchObject({ actorKind: "console", actorUserId: null, source: "console", targetKind: "company", targetId: companyId, changes: { by: { before: null, after: "stack-admin" } } });
    const data = await loadConsoleSetupOverview({ companyId, slug: SLUG });
    expect(data.handedOver?.by).toBe("stack-admin");
    expect(handOverState({ handedOver: data.handedOver, server: "done", via: "support" })).toMatchObject({ kind: "done", by: "stack-admin" });
    expect((await server())?.lines.map((l) => l.key)).toContain("handedOver");
  });

  it("is not NextUp's to confirm: a support session is refused", async () => {
    const { openGrant } = await import("@/lib/db/support-grants");
    const { supportBy } = await import("@/server/admin-session");
    const { grant } = await openGrant(companyId, { hours: 4, openedBy: "Kim", actor: { kind: "console", userId: null }, source: "console" });
    jar.set(ADMIN_COOKIE, signAdmin(Math.floor(Date.now() / 1000) + 3600, SECRET, supportBy(grant.id), false, "support"));
    expect(await confirmHandOverAction()).toEqual({ ok: false, code: "not-allowed" });
    expect(await audit(companyId, "audit.setup.handed_over")).toHaveLength(0);
  });
});
