import { afterAll, beforeAll, beforeEach, describe, expect, it, vi } from "vitest";
import type { Viewer } from "@/features/auth/session";
import { SEED } from "@/features/demo/seed";
import { getDb } from "@/lib/db/client";
import { resolveToken } from "@/lib/db/tokens";

let viewer: Viewer | null = null;
vi.mock("@/features/auth/session", () => ({ getViewerFor: vi.fn(async (slug: string) => (viewer && viewer.companySlug === slug ? viewer : null)) }));
vi.mock("next/cache", () => ({ revalidatePath: vi.fn() }));

import { createTokenAction, revokeTokenAction } from "@/server/actions/settings/api-tokens";

const db = getDb();
const ids: Record<string, { companyId: string; userId: string }> = {};

const asViewer = (key: string, slug: string, role: Viewer["role"]): Viewer => ({
  userId: ids[key].userId, companyId: ids[key].companyId, companySlug: slug, name: key, handle: null, role, epoch: 0, issuedAt: 0,
});

beforeAll(async () => {
  await db.company.deleteMany({});
  const c = await db.company.create({ data: { slug: "tok-a", name: "tok-a", mark: "M", seedJson: JSON.parse(JSON.stringify(SEED)), stage: "pilot" } });
  for (const [key, role] of [["managerA", "manager"], ["leaderA", "leader"]] as const) {
    const u = await db.user.create({ data: { companyId: c.id, name: key, email: `${key}@x.example`, role, active: true } });
    ids[key] = { companyId: c.id, userId: u.id };
  }
});
beforeEach(() => { viewer = null; });
afterAll(async () => {
  await db.company.deleteMany({});
  await db.$disconnect();
});

describe("API tokens page", () => {
  it("creates a v1 token once, it resolves, revoking ends it, both steps audited with createdBy", async () => {
    viewer = asViewer("managerA", "tok-a", "manager");
    const made = await createTokenAction("tok-a", { name: "SAP bridge", scopes: ["org:read", "cases:read"], expiry: "90d" });
    expect(made.ok).toBe(true);
    if (!made.ok) return;
    expect(made.token).toMatch(/^nxt_/);

    const row = await db.apiToken.findFirstOrThrow({ where: { companyId: ids.managerA.companyId, name: "SAP bridge" } });
    expect(row.createdBy).toBe(ids.managerA.userId);
    expect(row.expiresAt).not.toBeNull();
    expect(row.hash).not.toBe(made.token);

    const resolved = await resolveToken(made.token);
    expect(resolved).toMatchObject({ companySlug: "tok-a", scopes: expect.arrayContaining(["org:read"]) });

    expect(await createTokenAction("tok-a", { name: "sap bridge", scopes: ["org:read"], expiry: "never" })).toEqual({ ok: false, error: "settingsApiTokens.errNameInUse" });

    expect(await revokeTokenAction("tok-a", row.id)).toEqual({ ok: true });
    expect(await resolveToken(made.token)).toBeNull();
    expect(await revokeTokenAction("tok-a", row.id)).toEqual({ ok: false, error: "settingsApiTokens.errGone" });

    const audits = await db.auditEvent.findMany({ where: { companyId: ids.managerA.companyId, action: { in: ["audit.token.created", "audit.token.revoked"] } } });
    expect(audits.map((a) => a.action).sort()).toEqual(["audit.token.created", "audit.token.revoked"]);
    for (const a of audits) expect(a.actorUserId).toBe(ids.managerA.userId);
  });

  it("refuses a non-admin and creates nothing", async () => {
    viewer = asViewer("leaderA", "tok-a", "leader");
    const before = await db.apiToken.count({ where: { companyId: ids.managerA.companyId } });
    expect(await createTokenAction("tok-a", { name: "nope", scopes: ["org:read"], expiry: "30d" })).toEqual({ ok: false, error: "settingsCompany.forbidden" });
    expect(await db.apiToken.count({ where: { companyId: ids.managerA.companyId } })).toBe(before);
  });
});
