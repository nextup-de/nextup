// TMS-F1 (D16, D17): the Teams settings page. Against a real Postgres and the fake Bot Framework.
import { afterAll, beforeAll, beforeEach, describe, expect, it, vi } from "vitest";
import type { Viewer } from "@/features/auth/session";
import { SEED } from "@/features/demo/seed";
import { createT } from "@/i18n";
import { getDb } from "@/lib/db/client";
import { saveConversation } from "@/lib/db/teams";
import { resetAppToken } from "@/server/teams/connector";
import { startFakeBotFramework, type FakeBotFramework } from "../fake-botframework/fake-botframework";

let viewer: Viewer | null = null;
vi.mock("@/features/auth/session", () => ({ getViewerFor: vi.fn(async (slug: string) => (viewer && viewer.companySlug === slug ? viewer : null)) }));
vi.mock("next/cache", () => ({ revalidatePath: vi.fn() }));
vi.mock("@/i18n/server", () => ({ getT: async () => createT("en"), localeForUser: async () => "en" }));

import { GET } from "@/app/[company]/(app)/settings/teams/package/route";
import TeamsSettingsPage from "@/app/[company]/(app)/settings/teams/page";
import { sendTestCardAction, setTeamsOnAction } from "@/server/actions/settings/teams";

const db = getDb();
const SLUG = "tms-set";
const ENV = ["TEAMS_APP_ID", "TEAMS_APP_PASSWORD", "TEAMS_TENANT_ID", "TEAMS_OPENID_URL", "TEAMS_TOKEN_URL", "AUTH_SECRET"] as const;
const saved = Object.fromEntries(ENV.map((k) => [k, process.env[k]]));
let fake: FakeBotFramework;
let companyId = "";
let adminId = "";
let leaderId = "";

const asViewer = (userId: string, role: Viewer["role"]): Viewer => ({ userId, companyId, companySlug: SLUG, name: "x", handle: null, role, epoch: 0, issuedAt: 0 });
const form = (o: Record<string, string>): FormData => {
  const f = new FormData();
  for (const [k, v] of Object.entries(o)) f.append(k, v);
  return f;
};
const audits = () => db.auditEvent.findMany({ where: { companyId, action: "audit.settings.teams" }, orderBy: { at: "asc" } });
const params = Promise.resolve({ company: SLUG });
const configure = () => {
  Object.assign(process.env, { TEAMS_APP_ID: fake.appId, TEAMS_APP_PASSWORD: fake.password, TEAMS_TENANT_ID: "tenant-1", TEAMS_OPENID_URL: fake.openIdUrl, TEAMS_TOKEN_URL: fake.tokenUrl });
  resetAppToken();
};
const unconfigure = () => {
  for (const k of ["TEAMS_APP_ID", "TEAMS_APP_PASSWORD", "TEAMS_TENANT_ID"]) delete process.env[k];
};

type Node = { props?: Record<string, unknown> & { children?: unknown } };
function findProps(node: unknown, key: string): Record<string, unknown> | null {
  if (!node || typeof node !== "object") return null;
  const n = node as Node;
  if (n.props && key in n.props) return n.props;
  const kids = n.props?.children;
  for (const k of Array.isArray(kids) ? kids : [kids]) {
    const hit = findProps(k, key);
    if (hit) return hit;
  }
  return null;
}

beforeAll(async () => {
  fake = await startFakeBotFramework();
  process.env.AUTH_SECRET ||= "test-secret";
  await db.company.deleteMany({});
  const c = await db.company.create({ data: { slug: SLUG, name: "TMS settings", mark: "M", seedJson: JSON.parse(JSON.stringify(SEED)), stage: "pilot", entraTenantId: "tenant-1" } });
  companyId = c.id;
  const mk = async (name: string, role: string) => (await db.user.create({ data: { companyId, name, email: `${name}@tms-set.example`, role, active: true } })).id;
  adminId = await mk("admin", "manager");
  leaderId = await mk("leader", "leader");
});
beforeEach(async () => {
  viewer = null;
  configure();
  fake.activities.length = 0;
  await db.integration.deleteMany({ where: { companyId } });
  await db.auditEvent.deleteMany({ where: { companyId } });
  await db.outboxMessage.deleteMany({ where: { companyId } });
  await db.teamsConversation.deleteMany({ where: { companyId } });
  await db.company.update({ where: { id: companyId }, data: { entraTenantId: "tenant-1" } });
});
afterAll(async () => {
  await db.company.deleteMany({});
  await db.$disconnect();
  await fake.close();
  for (const k of ENV) {
    if (saved[k] === undefined) delete process.env[k];
    else process.env[k] = saved[k];
  }
});

describe("TMS settings page", () => {
  it("switches Teams on only when the app and the tenant are configured, and audits each change", async () => {
    viewer = asViewer(adminId, "manager");
    unconfigure();
    expect((await setTeamsOnAction({}, form({ slug: SLUG, on: "on" }))).error).toBe("settingsTeams.notConfigured");
    configure();
    await db.company.update({ where: { id: companyId }, data: { entraTenantId: null } });
    expect((await setTeamsOnAction({}, form({ slug: SLUG, on: "on" }))).error).toBe("settingsTeams.noTenant");
    expect(await db.integration.count({ where: { companyId } })).toBe(0);
    expect(await audits()).toHaveLength(0);

    await db.company.update({ where: { id: companyId }, data: { entraTenantId: "tenant-1" } });
    expect((await setTeamsOnAction({}, form({ slug: SLUG, on: "on" }))).ok).toBe(true);
    expect(await db.integration.findUniqueOrThrow({ where: { companyId_system: { companyId, system: "teams" } } })).toMatchObject({ on: true });
    expect((await setTeamsOnAction({}, form({ slug: SLUG }))).ok).toBe(true);
    expect((await db.integration.findUniqueOrThrow({ where: { companyId_system: { companyId, system: "teams" } } })).on).toBe(false);
    expect(await audits()).toHaveLength(2);
  });

  it("refuses everything for a non-admin", async () => {
    viewer = asViewer(leaderId, "leader");
    expect((await setTeamsOnAction({}, form({ slug: SLUG, on: "on" }))).error).toBe("settingsTeams.forbidden");
    expect((await sendTestCardAction({}, form({ slug: SLUG }))).error).toBe("settingsTeams.forbidden");
    expect((await GET(new Request("http://x/tms-set/settings/teams/package"), { params })).status).toBe(404);
    expect(await db.integration.count({ where: { companyId } })).toBe(0);
    expect(fake.activities).toHaveLength(0);
  });

  it("downloads the package for the stack's app id and host", async () => {
    viewer = asViewer(adminId, "manager");
    const res = await GET(new Request("http://x/tms-set/settings/teams/package", { headers: { host: "nextup.example.com" } }), { params });
    expect(res.status).toBe(200);
    expect(res.headers.get("content-type")).toBe("application/zip");
    const zip = Buffer.from(await res.arrayBuffer());
    expect(zip.subarray(0, 4)).toEqual(Buffer.from([0x50, 0x4b, 0x03, 0x04]));
    expect(zip.includes(Buffer.from(fake.appId))).toBe(true);
    expect(zip.includes(Buffer.from("nextup.example.com"))).toBe(true);
    unconfigure();
    expect((await GET(new Request("http://x/p"), { params })).status).toBe(409);
  });

  it("sends a test card that the fake receives in the admin's conversation, and says so when there is no chat", async () => {
    viewer = asViewer(adminId, "manager");
    expect((await sendTestCardAction({}, form({ slug: SLUG }))).error).toBe("settingsTeams.testNoChat");
    await saveConversation(companyId, { userId: adminId, aadObjectId: "aad-1", tenantId: "tenant-1", conversationId: "conv-admin", serviceUrl: fake.serviceUrl });
    expect((await sendTestCardAction({}, form({ slug: SLUG }))).ok).toBe(true);
    expect(fake.activities).toHaveLength(1);
    expect(fake.activities[0].conversationId).toBe("conv-admin");
    expect(JSON.stringify(fake.activities[0].activity)).toContain("Test card from NextUp");
    expect(await audits()).toHaveLength(1);

    fake.failNext(500);
    expect(await sendTestCardAction({}, form({ slug: SLUG }))).toMatchObject({ error: "settingsTeams.testFailed", detail: "Teams answered 500" });
  });

  it("shows the last delivered card and the newest failure", async () => {
    viewer = asViewer(adminId, "manager");
    const row = (key: string, status: string, extra: object) =>
      db.outboxMessage.create({ data: { companyId, channel: "teams", key, template: "raised", locale: "en", subject: "s", text: "t", status, nextAt: new Date("2020-01-01"), ...extra } });
    await row("a", "sent", { sentAt: new Date("2026-11-01T10:00:00Z") });
    await row("b", "sent", { sentAt: new Date("2026-11-02T10:00:00Z") });
    await row("c", "failed", { lastError: "Teams answered 403", createdAt: new Date("2026-11-03T10:00:00Z") });
    const props = findProps(await TeamsSettingsPage({ params }), "lastSent");
    expect(props).toMatchObject({ slug: SLUG, on: false, appConfigured: true, hasTenant: true, hasChat: false });
    expect((props!.lastSent as { at: string }).at).toBe("2026-11-02T10:00:00.000Z");
    expect(props!.lastFailed).toMatchObject({ error: "Teams answered 403" });
  });
});
