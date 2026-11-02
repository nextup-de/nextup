import { afterAll, beforeAll, beforeEach, describe, expect, it, vi } from "vitest";
import type { Viewer } from "@/features/auth/session";
import { toSeedJson } from "@/features/demo/parse";
import { SEED } from "@/features/demo/seed";

let viewer: Viewer | null = null;
let stackAdmin = false;
vi.mock("@/features/auth/session", () => ({ getViewerFor: vi.fn(async (slug: string) => (viewer && viewer.companySlug === slug ? viewer : null)) }));
vi.mock("@/server/actions/admin", () => ({ isAdmin: vi.fn(async () => stackAdmin) }));
vi.mock("next/cache", () => ({ revalidatePath: vi.fn() }));

import { getDb } from "@/lib/db/client";
import { adminResetTotpAction, enrolledManagersAction, resetTotpAction } from "@/server/actions/settings/totp-reset";

const db = getDb();
const A = "adm-totp-a";
const B = "adm-totp-b";
type Co = { id: string; slug: string; admin: string; other: string; member: string };
const co: Record<"a" | "b", Co> = { a: null as never, b: null as never };

const as = (c: Co, userId: string): Viewer => ({
  userId, companyId: c.id, companySlug: c.slug, name: "x", handle: null, role: "manager", epoch: 0, issuedAt: 0,
});
const form = (o: Record<string, string>) => {
  const f = new FormData();
  for (const [k, v] of Object.entries(o)) f.append(k, v);
  return f;
};
const enrol = (id: string, companyId: string) => db.user.update({ where: { id, companyId }, data: { totpSecretSealed: "sealed", totpEnabledAt: new Date() } });
const state = (id: string, companyId: string) => db.user.findFirstOrThrow({ where: { id, companyId }, select: { totpSecretSealed: true, totpEnabledAt: true } });

async function makeCompany(slug: string): Promise<Co> {
  const c = await db.company.create({ data: { slug, name: `Co ${slug}`, seedJson: toSeedJson(SEED) as object } });
  const mk = (name: string, role: string) =>
    db.user.create({ data: { companyId: c.id, name, email: `${name}@${slug}.example`, role }, select: { id: true } });
  return { id: c.id, slug, admin: (await mk("admin", "manager")).id, other: (await mk("other", "manager")).id, member: (await mk("memberx", "member")).id };
}

let log: ReturnType<typeof vi.spyOn>;
beforeAll(async () => {
  await db.company.deleteMany({ where: { slug: { in: [A, B] } } });
  co.a = await makeCompany(A);
  co.b = await makeCompany(B);
});
beforeEach(async () => {
  stackAdmin = false;
  viewer = as(co.a, co.a.admin);
  for (const [id, c] of [[co.a.admin, co.a.id], [co.a.other, co.a.id], [co.a.member, co.a.id], [co.b.admin, co.b.id]]) await enrol(id, c);
  log = vi.spyOn(console, "info").mockImplementation(() => {});
});
afterAll(async () => {
  await db.company.deleteMany({ where: { slug: { in: [A, B] } } });
  await db.$disconnect();
});

describe("ADM second factor reset", () => {
  it("a manager resets another manager of the company, who must enrol again, with one log line without personal data", async () => {
    expect(await enrolledManagersAction(A)).toEqual(expect.arrayContaining([co.a.other]));
    expect(await resetTotpAction(A, co.a.other)).toEqual({ ok: true });
    expect(await state(co.a.other, co.a.id)).toEqual({ totpSecretSealed: null, totpEnabledAt: null });
    const lines = log.mock.calls.map((c: unknown[]) => String(c[0])).filter((l: string) => l.startsWith("[auth] totp reset"));
    expect(lines).toHaveLength(1);
    expect(lines[0]).toMatch(/^\[auth\] totp reset \d{4}-\d\d-\d\dT[\d:.]+Z$/);
    expect(lines[0]).not.toContain(co.a.other);
    expect(lines[0]).not.toContain(A);
  });

  it("nobody resets their own, a member's, or another company's", async () => {
    expect((await resetTotpAction(A, co.a.admin)).ok).toBe(false);
    expect((await resetTotpAction(A, co.a.member)).ok).toBe(false);
    expect((await resetTotpAction(A, co.b.admin)).ok).toBe(false);
    for (const [id, c] of [[co.a.admin, co.a.id], [co.a.member, co.a.id], [co.b.admin, co.b.id]]) expect((await state(id, c)).totpEnabledAt).not.toBeNull();
    // a manager of company B cannot act on company A through its slug either
    viewer = as(co.b, co.b.admin);
    expect((await resetTotpAction(A, co.a.other)).ok).toBe(false);
    expect((await state(co.a.other, co.a.id)).totpEnabledAt).not.toBeNull();
  });

  it("a stack admin resets the second factor in /admin; someone not signed in to /admin cannot", async () => {
    const f = form({ slug: A, userId: co.a.other });
    expect(await adminResetTotpAction({}, f)).toMatchObject({ error: expect.any(String) });
    expect((await state(co.a.other, co.a.id)).totpEnabledAt).not.toBeNull();
    stackAdmin = true;
    expect(await adminResetTotpAction({}, f)).toEqual({ saved: true });
    expect(await state(co.a.other, co.a.id)).toEqual({ totpSecretSealed: null, totpEnabledAt: null });
    // a person of another company is not reachable through this company's slug
    expect(await adminResetTotpAction({}, form({ slug: A, userId: co.b.admin }))).toMatchObject({ error: expect.any(String) });
    expect((await state(co.b.admin, co.b.id)).totpEnabledAt).not.toBeNull();
  });
});
