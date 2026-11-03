// GDP-A1 on the proof database: the console's actions write one audit row each (D12), for the guard's
// company only, with secrets as set/replaced and without any name or email.
import type { DirectoryEntry, DirectoryPage, DirectorySource } from "@nextup/contracts/public";
import { PUBLIC_CONTRACT_VERSION } from "@nextup/contracts/public";
import { afterAll, beforeAll, beforeEach, afterEach, describe, expect, it, vi } from "vitest";
import { ADMIN_COOKIE, signAdmin } from "@/features/auth/cookie";
import { getDb } from "@/lib/db/client";

const SECRET = "gdp-console-audit-secret-0123456789";
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
vi.mock("@/server/jira-sync", () => ({ kickJira: vi.fn() }));
vi.mock("@/server/mail", () => ({ sendMail: vi.fn(async () => ({ ok: true })), mailConfigured: () => true }));

const { saveConsoleJira, setConsoleJiraOn, setConsoleM365, disconnectEveryoneConsole, saveConsoleAi } = await import("@/server/actions/console-connectors");
const { saveAssistSettingsAction } = await import("@/server/actions/assist-admin");
const { saveIdeaSettingsAction } = await import("@/server/actions/ideas-admin");
const { openSupportAccess, revokeSupportAccess } = await import("@/server/actions/support-access");
const { setDirectoryAction } = await import("@/server/actions/directory-admin");
const { runDirectoryOnce } = await import("@/server/directory/sync");
const { pullPlatformJobs } = await import("@/server/platform-jobs-sync");
const { createToken, revokeToken } = await import("@/lib/db/tokens");
const { consoleActor } = await import("@/server/audit/record");

const db = getDb();
const JIRA_TOKEN = "jira-api-token-value";
const AI_KEY = "ai-provider-key-value";
const env = { ...process.env };
const exp = () => Math.floor(Date.now() / 1000) + 3600;
const asAdmin = () => (cookie = signAdmin(exp(), SECRET, "Kim Becker", false, "stack-admin"));
let acme = "";
let globex = "";
const rowsOf = (companyId: string, action?: string) =>
  db.auditEvent.findMany({ where: { companyId, ...(action ? { action } : {}) }, orderBy: { at: "asc" } });

const entry = (n: number): DirectoryEntry => ({
  externalId: `oid-${n}`, displayName: `Person ${n}`, email: `p${n}@gdp-a1.test`, department: "Ops", jobTitle: null,
  managerExternalId: null, groupExternalIds: [], employeeId: null, active: true,
});
const source = (page: DirectoryPage): DirectorySource => ({
  info: { kind: "DirectorySource", id: "test", contractVersion: PUBLIC_CONTRACT_VERSION },
  async delta() {
    return page;
  },
});

beforeAll(async () => {
  await db.company.deleteMany({});
  acme = (await db.company.create({ data: { slug: "acme", name: "Acme", stage: "sandbox", seedJson: {} } })).id;
  globex = (await db.company.create({ data: { slug: "globex", name: "Globex", stage: "sandbox", seedJson: {} } })).id;
  await db.orgUnit.create({ data: { companyId: acme, key: "ops", name: "Ops" } });
  await db.user.create({ data: { companyId: acme, name: "Kim Becker", email: "kim.becker@acme-gdp.test", role: "manager", dept: "", ini: "KB" } });
});

beforeEach(() => {
  process.env.AUTH_SECRET = SECRET;
  process.env.TENANT_MODE = "single";
  process.env.COMPANY_SLUG = "acme";
  process.env.CONNECTOR_VAULT_KEY = "ab".repeat(32);
  process.env.OPS_URL = "https://admin.test";
  process.env.OPS_TOKEN = "stack-token";
  asAdmin();
});

afterEach(() => {
  for (const k of ["AUTH_SECRET", "TENANT_MODE", "COMPANY_SLUG", "CONNECTOR_VAULT_KEY", "OPS_URL", "OPS_TOKEN"]) {
    if (env[k] === undefined) delete process.env[k];
    else process.env[k] = env[k];
  }
  vi.unstubAllGlobals();
});

afterAll(async () => {
  await db.company.deleteMany({});
  await db.$disconnect();
});

describe("GDP console audit", () => {
  it("Jira save, on, off: one row each, the token only as set/replaced", async () => {
    const form = { flavor: "dc", siteUrl: "https://jira.acme.example", email: "", token: JIRA_TOKEN, projectKey: "NUP", epicTypeId: "10", stepTypeId: "11" };
    expect(await saveConsoleJira(form)).toEqual({ ok: true });
    expect(await saveConsoleJira({ ...form, token: "another-token-value" })).toEqual({ ok: true });
    expect(await setConsoleJiraOn(true)).toEqual({ ok: true });
    expect(await setConsoleJiraOn(false)).toEqual({ ok: true });

    const saved = await rowsOf(acme, "audit.connector.saved");
    expect(saved).toHaveLength(2);
    expect(saved[0]).toMatchObject({ actorKind: "console", targetKind: "connector", targetId: "jira", source: "console" });
    expect((saved[0].changes as Record<string, { after: unknown }>).token.after).toBe("set");
    expect((saved[1].changes as Record<string, { after: unknown }>).token.after).toBe("replaced");
    expect(await rowsOf(acme, "audit.connector.on")).toHaveLength(1);
    expect(await rowsOf(acme, "audit.connector.off")).toHaveLength(1);
  });

  it("AI provider save: target ai, the key only as set", async () => {
    expect(await saveConsoleAi({ choice: "azure-openai", region: "eu", model: "gpt", endpoint: "https://aoai.acme.example", deployment: "d1", key: AI_KEY })).toEqual({ ok: true });
    const rows = await rowsOf(acme, "audit.connector.saved");
    const ai = rows.filter((r) => r.targetId === "ai");
    expect(ai).toHaveLength(1);
    expect(ai[0]).toMatchObject({ actorKind: "console", targetKind: "connector" });
    expect((ai[0].changes as Record<string, { after: unknown }>).key.after).toBe("set");
  });

  it("Microsoft 365 on/off and disconnect everyone", async () => {
    await db.connection.create({ data: { companyId: acme, userId: (await db.user.findFirstOrThrow({ where: { companyId: acme } })).id, provider: "m365", scopes: [], refreshTokenSealed: "x" } });
    expect(await setConsoleM365(true)).toEqual({ ok: true });
    expect(await disconnectEveryoneConsole()).toEqual({ ok: true });
    const on = (await rowsOf(acme, "audit.connector.on")).filter((r) => r.targetId === "m365");
    expect(on).toHaveLength(1);
    const gone = await rowsOf(acme, "audit.connector.disconnected");
    expect(gone).toHaveLength(1);
    expect(gone[0]).toMatchObject({ targetKind: "connector", targetId: "m365", changes: { count: { before: null, after: 1 } } });
  });

  it("assistant settings and ideas threshold; a form that still sends retentionDays is not an error", async () => {
    const form = new FormData();
    form.set("assistant", "on");
    form.set("ceiling", "internal");
    form.set("retentionDays", "30");
    form.set("dpaSignedAt", "2026-10-01");
    form.set("rules", "No health data");
    form.set("patterns", "");
    const r = await saveAssistSettingsAction({}, form);
    expect(r.ok).toBe(true);
    const saved = await rowsOf(acme, "audit.assistant.saved");
    expect(saved).toHaveLength(1);
    expect(saved[0]).toMatchObject({ actorKind: "console", targetKind: "assistant" });
    expect(Object.keys(saved[0].changes as object)).not.toContain("retentionDays");
    expect((await db.companyConfig.findUniqueOrThrow({ where: { companyId: acme } })).retentionDays).not.toBe(30);

    const ideas = new FormData();
    ideas.set("publishThreshold", "55");
    expect((await saveIdeaSettingsAction({}, ideas)).ok).toBe(true);
    const idea = await rowsOf(acme, "audit.assistant.ideas");
    expect(idea).toHaveLength(1);
    expect(idea[0].changes).toMatchObject({ publishThreshold: { after: 55 } });
  });

  it("support access: opened with the expiry only, then revoked", async () => {
    const opened = await openSupportAccess();
    expect(opened.ok).toBe(true);
    expect(await revokeSupportAccess()).toEqual({ ok: true });
    const granted = await rowsOf(acme, "audit.access.support_granted");
    expect(granted).toHaveLength(1);
    expect(granted[0]).toMatchObject({ actorKind: "console", targetKind: "support_grant" });
    expect(Object.keys(granted[0].changes as object)).toEqual(["expiresAt"]);
    if (opened.ok) expect(JSON.stringify(granted[0])).not.toContain(opened.supportCode);
    expect(await rowsOf(acme, "audit.access.support_revoked")).toHaveLength(1);
  });

  it("directory on/off, and a run that changed something writes one directory row", async () => {
    expect(await setDirectoryAction(true, "graph")).toEqual({ ok: true });
    await runDirectoryOnce(new Date(), () => source({ entries: [entry(1), entry(2)], groups: [], removedExternalIds: [], nextCursor: null }));
    // Nothing new on the second run: no row.
    await runDirectoryOnce(new Date(Date.now() + 3_600_000), () => source({ entries: [entry(1), entry(2)], groups: [], removedExternalIds: [], nextCursor: null }));
    expect(await setDirectoryAction(false, "graph")).toEqual({ ok: true });
    expect(await rowsOf(acme, "audit.directory.on")).toHaveLength(1);
    expect(await rowsOf(acme, "audit.directory.off")).toHaveLength(1);
    const runs = await rowsOf(acme, "audit.directory.run");
    expect(runs).toHaveLength(1);
    expect(runs[0]).toMatchObject({ actorKind: "directory", source: "directory", changes: { added: { after: 2 }, updated: { after: 0 }, deactivated: { after: 0 }, handed: { after: 0 } } });
  });

  it("a set_stage platform job", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn(async (_url: string, init?: RequestInit) =>
        init?.method === "POST" ? new Response("{}", { status: 200 }) : new Response(JSON.stringify({ contractVersion: 1, jobs: [{ id: "gdp-a1-stage", action: "set_stage", slug: "acme", stage: "live" }] }), { status: 200 }),
      ),
    );
    await pullPlatformJobs();
    const rows = await rowsOf(acme, "audit.company.stage");
    expect(rows).toHaveLength(1);
    expect(rows[0]).toMatchObject({ actorKind: "platform", source: "platform", targetKind: "company", targetId: acme, changes: { stage: { before: "sandbox", after: "live" } } });
  });

  it("an API token: created with its scopes only, then revoked", async () => {
    const actor = await consoleActor();
    const raw = await createToken(acme, "ci", ["read", "write"], actor);
    const row = await db.apiToken.findFirstOrThrow({ where: { companyId: acme } });
    expect(await revokeToken(acme, row.id, actor)).toBe(true);
    const created = await rowsOf(acme, "audit.token.created");
    expect(created).toHaveLength(1);
    expect(created[0]).toMatchObject({ targetKind: "token", targetId: row.id, changes: { scopes: { after: ["read", "write"] } } });
    expect(JSON.stringify(created[0])).not.toContain(raw);
    expect(JSON.stringify(created[0])).not.toContain(row.hash);
    expect(await rowsOf(acme, "audit.token.revoked")).toHaveLength(1);
  });

  it("no row of globex, no secret, no name or email of an acme user", async () => {
    expect(await db.auditEvent.count({ where: { companyId: globex } })).toBe(0);
    const all = JSON.stringify((await rowsOf(acme)).map((r) => r.changes));
    for (const s of [JIRA_TOKEN, AI_KEY, "Kim Becker", "kim.becker@acme-gdp.test"]) expect(all).not.toContain(s);
  });

  it("a support session that tries a save writes no row", async () => {
    const before = await db.auditEvent.count({ where: { companyId: acme } });
    const opened = await openSupportAccess();
    expect(opened.ok).toBe(true);
    const grant = await db.supportGrant.findFirstOrThrow({ where: { companyId: acme, revokedAt: null } });
    const { supportBy } = await import("@/server/admin-session");
    cookie = signAdmin(Math.floor(grant.expiresAt.getTime() / 1000), SECRET, supportBy(grant.id), false, "support");
    const afterOpen = await db.auditEvent.count({ where: { companyId: acme } });
    expect(afterOpen).toBe(before + 1); // the grant itself
    expect(await setConsoleM365(true)).toEqual({ ok: false, code: "support-read-only" });
    expect(await saveConsoleJira({ flavor: "dc", siteUrl: "https://x.example", email: "", token: "t", projectKey: "NUP", epicTypeId: "10", stepTypeId: "11" })).toEqual({ ok: false, code: "support-read-only" });
    expect(await db.auditEvent.count({ where: { companyId: acme } })).toBe(afterOpen);
  });
});
