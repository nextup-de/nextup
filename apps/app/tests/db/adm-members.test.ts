import { afterAll, beforeAll, beforeEach, describe, expect, it, vi } from "vitest";
import type { Viewer } from "@/features/auth/session";
import { hashLoginCode, looksLikeLoginCode } from "@/features/auth/login-code";
import { toSeedJson } from "@/features/demo/parse";
import { SEED } from "@/features/demo/seed";

let viewer: Viewer | null = null;
vi.mock("@/features/auth/session", () => ({ getViewerFor: vi.fn(async (slug: string) => (viewer && viewer.companySlug === slug ? viewer : null)) }));
vi.mock("next/cache", () => ({ revalidatePath: vi.fn() }));
// The fake mailer: records what would have been sent.
const sent: { to: string; subject: string; text: string }[] = [];
vi.mock("@/server/mail", () => ({
  sendMail: vi.fn(async (m: { to: string; subject: string; text: string }) => { sent.push(m); return { ok: true }; }),
}));

import { getDb } from "@/lib/db/client";
import { inviteMemberAction, memberSeatAction } from "@/server/actions/members";

const db = getDb();
const A = "adm-members-a";
const B = "adm-members-b";
type Co = { id: string; slug: string; admin: string; leader: string; member: string; seat: string };
const co: Record<"a" | "b", Co> = { a: null as never, b: null as never };

const form = (o: Record<string, string>) => {
  const f = new FormData();
  for (const [k, v] of Object.entries(o)) f.append(k, v);
  return f;
};
const as = (c: Co, userId: string, role: Viewer["role"]): Viewer => ({
  userId, companyId: c.id, companySlug: c.slug, name: "x", handle: null, role, epoch: 0, issuedAt: 0,
});

async function makeCompany(slug: string): Promise<Co> {
  const c = await db.company.create({ data: { openedAt: new Date(), slug, name: `Co ${slug}`, seedJson: toSeedJson(SEED) as object } });
  const mk = (name: string, role: string) =>
    db.user.create({ data: { companyId: c.id, name, email: `${name}@${slug}.example`, role }, select: { id: true } });
  const u = await db.orgUnit.create({ data: { companyId: c.id, key: "OPS", name: "Operations", kind: "dept", headcount: 2, sort: 0 } });
  const r = await db.orgRole.create({ data: { companyId: c.id, orgUnitId: u.id, title: "Ops lead", decides: [], sort: 0 } });
  const seat = await db.orgRoleHolder.create({ data: { companyId: c.id, roleId: r.id, name: "Ops seat", sort: 0 } });
  return { id: c.id, slug, admin: (await mk("admin", "manager")).id, leader: (await mk("leader", "leader")).id, member: (await mk("memberx", "member")).id, seat: seat.id };
}

const snapshot = async (companyId: string) => ({
  users: await db.user.findMany({ where: { companyId }, orderBy: { id: "asc" } }),
  seats: await db.orgRoleHolder.findMany({ where: { companyId }, orderBy: { id: "asc" } }),
});

/** What sign-in does with a typed code (server/actions/auth.ts codeLogin), without the session. */
async function accepts(slug: string, raw: string): Promise<boolean> {
  if (!looksLikeLoginCode(raw, slug)) return false;
  const user = await db.user.findUnique({ where: { loginCodeHash: hashLoginCode(raw) }, include: { company: { select: { slug: true } } } });
  return Boolean(user && user.active && user.company.slug === slug);
}

beforeAll(async () => {
  await db.company.deleteMany({ where: { slug: { in: [A, B] } } });
  co.a = await makeCompany(A);
  co.b = await makeCompany(B);
});
beforeEach(() => { sent.length = 0; });
afterAll(async () => {
  await db.company.deleteMany({ where: { slug: { in: [A, B] } } });
  await db.$disconnect();
});

describe("ADM members", () => {
  it("invites a member: the user gets a login code, one mail goes to them, and the mailed code signs in", async () => {
    viewer = as(co.a, co.a.admin, "manager");
    const before = await snapshot(co.b.id);
    const r = await inviteMemberAction({}, form({ slug: A, name: "Xenia Test", email: "Xenia@Example.com", role: "member", dept: "OPS" }));
    expect(r.problems).toBeUndefined();
    expect(r.mailed).toBe(true);

    const user = await db.user.findFirstOrThrow({ where: { companyId: co.a.id, email: "xenia@example.com" } });
    expect(user.loginCodeHash).not.toBeNull();
    expect(sent).toHaveLength(1);
    expect(sent[0].to).toBe("xenia@example.com");

    const code = r.added!.code;
    expect(sent[0].text).toContain(code);
    expect(sent[0].subject).not.toContain(code);
    expect(user.loginCodeHash).toBe(hashLoginCode(code));
    expect(await accepts(A, code)).toBe(true);
    expect(await accepts(B, code)).toBe(false);
    expect(await snapshot(co.b.id)).toEqual(before);
  });

  it("links and unlinks a seat; the other company is untouched", async () => {
    viewer = as(co.a, co.a.admin, "manager");
    const before = await snapshot(co.b.id);
    expect((await memberSeatAction({}, form({ slug: A, userId: co.a.member, seatId: co.a.seat }))).error).toBeUndefined();
    expect((await db.orgRoleHolder.findFirstOrThrow({ where: { id: co.a.seat, companyId: co.a.id } })).userId).toBe(co.a.member);
    // a taken seat cannot be linked to someone else
    expect((await memberSeatAction({}, form({ slug: A, userId: co.a.leader, seatId: co.a.seat }))).error).toBeTruthy();
    expect((await memberSeatAction({}, form({ slug: A, userId: co.a.member, seatId: co.a.seat, intent: "unlink" }))).error).toBeUndefined();
    expect((await db.orgRoleHolder.findFirstOrThrow({ where: { id: co.a.seat, companyId: co.a.id } })).userId).toBeNull();
    // a seat or a member of company B is out of reach
    expect((await memberSeatAction({}, form({ slug: A, userId: co.a.member, seatId: co.b.seat }))).error).toBeTruthy();
    expect((await memberSeatAction({}, form({ slug: A, userId: co.b.member, seatId: co.a.seat }))).error).toBeTruthy();
    expect(await snapshot(co.b.id)).toEqual(before);
  });

  it("writes and sends nothing for a leader", async () => {
    viewer = as(co.a, co.a.leader, "leader");
    const before = await snapshot(co.a.id);
    const r = await inviteMemberAction({}, form({ slug: A, name: "Yara Test", email: "yara@example.com", role: "member" }));
    expect(r.problems?.length).toBeGreaterThan(0);
    expect((await memberSeatAction({}, form({ slug: A, userId: co.a.member, seatId: co.a.seat }))).error).toBeTruthy();
    expect(sent).toHaveLength(0);
    expect(await snapshot(co.a.id)).toEqual(before);
  });
});
