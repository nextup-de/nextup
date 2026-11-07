// FX1: one guard for every console write. A support session reads and never writes; an ended grant or a
// closed break-glass window ends the session at once, for reads and writes alike. The first test scans the
// source, so a new console action fails here until someone says how it is guarded.
import { readdirSync, readFileSync } from "node:fs";
import path from "node:path";
import { afterAll, afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { ADMIN_COOKIE, signAdmin } from "@/features/auth/cookie";
import { getDb } from "@/lib/db/client";

const SECRET = "fx1-console-writes-secret-0123456789";
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

const admin = await import("@/server/actions/admin");
const assist = await import("@/server/actions/assist-admin");
const connectors = await import("@/server/actions/console-connectors");
const directory = await import("@/server/actions/directory-admin");
const ideas = await import("@/server/actions/ideas-admin");
const m365 = await import("@/server/actions/m365");
const totp = await import("@/server/actions/settings/totp-reset");
const successFactors = await import("@/server/actions/successfactors-admin");
const support = await import("@/server/actions/support-access");
const tickets = await import("@/server/actions/tickets");
const { openGrant } = await import("@/lib/db/support-grants");
const { breakGlassBy } = await import("@/features/admin/break-glass");
const { supportBy } = await import("@/server/admin-session");

const db = getDb();
const SLUG = "fx1-co";
const TENANT = "72f988bf-86f1-41af-91ab-2d7cd011db47";
const env = { ...process.env };
let companyId = "";
let userId = "";
let documentId = "";

const form = (fields: Record<string, string>) => {
  const f = new FormData();
  for (const [k, v] of Object.entries(fields)) f.set(k, v);
  return f;
};
const exp = () => Math.floor(Date.now() / 1000) + 3600;

// Every console write, called the way its page calls it. The values would change something if they got through.
const WRITES: Record<string, () => Promise<unknown>> = {
  "actions/admin#issueLoginCodesAction": () => admin.issueLoginCodesAction({}, form({ slug: SLUG, userId })),
  "actions/admin#setStackAdminAction": () => admin.setStackAdminAction({}, form({ slug: SLUG, userId, stackAdmin: "on" })),
  "actions/admin#setEntraTenantAction": () => admin.setEntraTenantAction({}, form({ slug: SLUG, tenantId: TENANT })),
  "actions/assist-admin#saveAssistSettingsAction": () => assist.saveAssistSettingsAction({} as never, form({})),
  "actions/assist-admin#deleteDocumentAction": () => assist.deleteDocumentAction(form({ id: documentId })),
  "actions/console-connectors#testConsoleJira": () => connectors.testConsoleJira({}),
  "actions/console-connectors#saveConsoleJira": () => connectors.saveConsoleJira({}),
  "actions/console-connectors#setConsoleJiraOn": () => connectors.setConsoleJiraOn(false),
  "actions/console-connectors#syncConsoleJiraNow": () => connectors.syncConsoleJiraNow(),
  "actions/console-connectors#setConsoleM365": () => connectors.setConsoleM365(true),
  "actions/console-connectors#disconnectEveryoneConsole": () => connectors.disconnectEveryoneConsole(),
  "actions/console-connectors#saveConsoleAi": () => connectors.saveConsoleAi({}),
  "actions/directory-admin#setDirectoryAction": () => directory.setDirectoryAction(true, "entra"),
  "actions/directory-admin#runDirectoryNowAction": () => directory.runDirectoryNowAction(),
  "actions/ideas-admin#saveIdeaSettingsAction": () => ideas.saveIdeaSettingsAction({} as never, form({ publishThreshold: "50" })),
  "actions/m365#setM365SearchAction": () => m365.setM365SearchAction(form({ m365Search: "on" })),
  "actions/m365#disconnectEveryoneAction": () => m365.disconnectEveryoneAction(),
  "actions/settings/totp-reset#adminResetTotpAction": () => totp.adminResetTotpAction({}, form({ slug: SLUG, userId })),
  "actions/successfactors-admin#saveSuccessFactorsAction": () => successFactors.saveSuccessFactorsAction({}),
  "actions/successfactors-admin#testSuccessFactorsAction": () => successFactors.testSuccessFactorsAction(),
  "actions/support-access#openSupportAccess": () => support.openSupportAccess(),
  "actions/support-access#revokeSupportAccess": () => support.revokeSupportAccess(),
  "actions/tickets#reportFromAdmin": () => tickets.reportFromAdmin({}),
};

/** These answer nothing; only the database shows that they were refused. */
const SILENT = new Set(["actions/assist-admin#deleteDocumentAction", "actions/m365#setM365SearchAction", "actions/m365#disconnectEveryoneAction"]);

/** Exports of the same modules that are not console writes, and why. */
const NOT_WRITES: Record<string, string> = {
  "actions/admin#isAdmin": "a read",
  "actions/admin#ownCompanyRow": "a read; covered below",
  "actions/admin#adminSignIn": "the way in",
  "actions/admin#adminSignOut": "the way out",
  "actions/support-access#supportSignIn": "the way in",
  "actions/m365#disconnectM365Action": "a person's own connection, by company session",
  "actions/settings/totp-reset#enrolledManagersAction": "a company admin, by company session",
  "actions/settings/totp-reset#resetTotpAction": "a company admin, by company session",
  "actions/tickets#reportTicket": "a person's report, by company session",
  "actions/tickets#reportsPath": "a link",
};

function sourceFiles(dir: string): string[] {
  return readdirSync(dir, { withFileTypes: true }).flatMap((e) => {
    const p = path.join(dir, e.name);
    return e.isDirectory() ? sourceFiles(p) : /\.tsx?$/.test(e.name) ? [p] : [];
  });
}

/** What the database holds that a console write could change, the audit trail included. */
async function fingerprint(): Promise<string> {
  const [company, config, users, integrations, connections, documents, grants, tickets_, audit] = await Promise.all([
    db.company.findMany({ where: { id: companyId }, select: { entraTenantId: true, stage: true } }),
    db.companyConfig.findMany({ where: { companyId } }),
    db.user.findMany({ where: { companyId }, orderBy: { id: "asc" }, select: { id: true, loginCodeHash: true, isStackAdmin: true, totpEnabledAt: true } }),
    db.integration.findMany({ where: { companyId }, orderBy: { id: "asc" } }),
    db.connection.count({ where: { companyId } }),
    db.document.count({ where: { companyId } }),
    db.supportGrant.findMany({ where: { companyId }, orderBy: { id: "asc" }, select: { id: true, revokedAt: true, expiresAt: true } }),
    db.ticket.count({ where: { companyId } }),
    db.auditEvent.count({ where: { companyId } }),
  ]);
  return JSON.stringify({ company, config, users, integrations, connections, documents, grants, tickets_, audit });
}

beforeEach(async () => {
  process.env.AUTH_SECRET = SECRET;
  process.env.TENANT_MODE = "single";
  process.env.COMPANY_SLUG = SLUG;
  process.env.BREAK_GLASS_DIR = "/nonexistent-break-glass";
  cookie = undefined;
  await db.company.deleteMany({});
  const c = await db.company.create({ data: { slug: SLUG, name: "FX1", stage: "pilot", seedJson: {} } });
  companyId = c.id;
  const u = await db.user.create({
    data: { companyId, name: "Person", email: "person@fx1.example", role: "manager", active: true, totpSecretSealed: "sealed", totpEnabledAt: new Date() },
  });
  userId = u.id;
  await db.connection.create({ data: { companyId, userId, provider: "m365", scopes: ["Files.Read.All"], refreshTokenSealed: "sealed" } });
  documentId = (await db.document.create({ data: { companyId, source: "upload", externalId: "d1", title: "Doc", body: "Body" } })).id;
  await db.integration.create({ data: { companyId, system: "jira", on: true, settings: {}, webhookSecretSealed: "sealed" } });
});

afterEach(() => {
  for (const k of ["AUTH_SECRET", "TENANT_MODE", "COMPANY_SLUG", "BREAK_GLASS_DIR"]) {
    if (env[k] === undefined) delete process.env[k];
    else process.env[k] = env[k];
  }
});

afterAll(async () => {
  await db.company.deleteMany({});
  await db.$disconnect();
});

const asStackAdmin = () => (cookie = signAdmin(exp(), SECRET, "Kim", false, "stack-admin"));
async function asSupport(ended: boolean): Promise<void> {
  const { grant } = await openGrant(companyId, { hours: 4, openedBy: "Kim", actor: { kind: "console", userId: null }, source: "console" });
  cookie = signAdmin(exp(), SECRET, supportBy(grant.id), false, "support");
  if (ended) await db.supportGrant.update({ where: { id: grant.id }, data: { revokedAt: new Date() } });
}
const asClosedBreakGlass = () => (cookie = signAdmin(exp(), SECRET, breakGlassBy(new Date()), true, "break-glass"));

describe("FX1 console writes", () => {
  it("knows every export of every module that acts for the /admin session", () => {
    const root = path.resolve(__dirname, "../../src");
    const found: string[] = [];
    for (const file of sourceFiles(root)) {
      const text = readFileSync(file, "utf8");
      if (!text.startsWith('"use server"')) continue;
      if (!/consoleCompany|consoleWrite|consoleActor|\bisAdmin\b/.test(text)) continue;
      const mod = path.relative(path.join(root, "server"), file).replace(/\\/g, "/").replace(/\.tsx?$/, "");
      for (const m of text.matchAll(/^export (?:async )?(?:function|const) (\w+)/gm)) found.push(`${mod}#${m[1]}`);
    }
    expect(found.sort()).toEqual([...Object.keys(WRITES), ...Object.keys(NOT_WRITES)].sort());
  });

  // Declared as functions so each test sets up its own session; the names read in the report.
  const SESSIONS: [string, () => Promise<unknown> | unknown][] = [
    ["an open support session", () => asSupport(false)],
    ["a support session whose grant ended", () => asSupport(true)],
    ["a break-glass session whose window closed", () => asClosedBreakGlass()],
  ];

  describe.each(SESSIONS)("%s", (_name, enter) => {
    it.each(Object.keys(WRITES))("refuses %s and changes nothing", async (key) => {
      await enter();
      const before = await fingerprint();
      const answer = await WRITES[key]();
      expect(await fingerprint()).toBe(before);
      if (!SILENT.has(key)) expect(JSON.stringify(answer)).toMatch(/read-only|not signed in|not-allowed|log in to the admin area/i);
    });
  });

  it("a support session's refused write is in the server log", async () => {
    const warn = vi.spyOn(console, "warn").mockImplementation(() => {});
    await asSupport(false);
    await admin.setEntraTenantAction({}, form({ slug: SLUG, tenantId: TENANT }));
    expect(warn.mock.calls.map((c) => String(c[0])).filter((l) => l.startsWith("[console] write refused"))).toHaveLength(1);
    warn.mockRestore();
  });

  it("End now and a closed window stop access at once, not only writes", async () => {
    await asSupport(false);
    expect(await admin.isAdmin()).toBe(true);
    expect(await admin.ownCompanyRow()).not.toBeNull();

    await db.supportGrant.updateMany({ where: { companyId }, data: { revokedAt: new Date() } });
    expect(await admin.isAdmin()).toBe(false);
    expect(await admin.ownCompanyRow()).toBeNull();

    asClosedBreakGlass();
    expect(await admin.isAdmin()).toBe(false);
    expect(cookie).toBeUndefined();
  });

  it("the guard does not get in the way of the people it should let through", async () => {
    asStackAdmin();
    for (const key of [
      "actions/admin#issueLoginCodesAction",
      "actions/admin#setStackAdminAction",
      "actions/admin#setEntraTenantAction",
      "actions/assist-admin#deleteDocumentAction",
      "actions/m365#setM365SearchAction",
      "actions/m365#disconnectEveryoneAction",
      "actions/settings/totp-reset#adminResetTotpAction",
    ]) {
      const before = await fingerprint();
      await WRITES[key]();
      expect(await fingerprint(), key).not.toBe(before);
    }

    // The shared code on a demo company works as before.
    await db.company.update({ where: { id: companyId }, data: { stage: "demo", entraTenantId: null } });
    cookie = signAdmin(exp(), SECRET, undefined, true, "break-glass");
    expect(await admin.isAdmin()).toBe(true);
    await WRITES["actions/admin#setEntraTenantAction"]();
    expect((await db.company.findUniqueOrThrow({ where: { id: companyId } })).entraTenantId).toBe(TENANT);
  });
});
