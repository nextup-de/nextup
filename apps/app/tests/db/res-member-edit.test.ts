// Plan RES, RES-M1: a company admin corrects the name and email of a member who does not come from the directory.
import { afterAll, beforeAll, describe, expect, it, vi } from "vitest";
import type { Viewer } from "@/features/auth/session";
import { toSeedJson } from "@/features/demo/parse";
import { SEED } from "@/features/demo/seed";

let viewer: Viewer | null = null;
vi.mock("@/features/auth/session", () => ({ getViewerFor: vi.fn(async (slug: string) => (viewer && viewer.companySlug === slug ? viewer : null)) }));
vi.mock("next/cache", () => ({ revalidatePath: vi.fn() }));
vi.mock("@/i18n/server", () => ({ getLocale: vi.fn(async () => "en") }));

import { getDb } from "@/lib/db/client";
import { saveMemberDetailsAction } from "@/server/actions/members";

const db = getDb();
const SLUG = "res-member-edit";
type Co = { id: string; admin: string; leader: string; own: string; directory: string; other: string };
let co: Co;

const form = (o: Record<string, string>) => {
  const f = new FormData();
  for (const [k, v] of Object.entries(o)) f.append(k, v);
  return f;
};
const as = (userId: string, role: Viewer["role"]): Viewer => ({ userId, companyId: co.id, companySlug: SLUG, name: "x", handle: null, role, epoch: 0, issuedAt: 0 });
const save = (userId: string, name: string, email: string) => saveMemberDetailsAction({}, form({ slug: SLUG, userId, name, email }));
const rowOf = (id: string) => db.user.findFirstOrThrow({ where: { id, companyId: co.id } });
const audits = () => db.auditEvent.findMany({ where: { companyId: co.id, action: "audit.member.saved" }, orderBy: { at: "asc" } });

beforeAll(async () => {
  await db.company.deleteMany({ where: { slug: SLUG } });
  const c = await db.company.create({ data: { openedAt: new Date(), slug: SLUG, name: "Co", seedJson: toSeedJson(SEED) as object } });
  const mk = async (name: string, role: string, extra: object = {}) =>
    (await db.user.create({ data: { companyId: c.id, name, email: `${name.toLowerCase().replace(/ /g, ".")}@res.example`, role, ...extra }, select: { id: true } })).id;
  co = {
    id: c.id,
    admin: await mk("Admin", "manager"),
    leader: await mk("Leader", "leader"),
    own: await mk("Own Person", "member"),
    directory: await mk("Directory Person", "member", { directorySyncedAt: new Date() }),
    other: await mk("Other Person", "member"),
  };
});
afterAll(async () => {
  await db.company.deleteMany({ where: { slug: SLUG } });
  await db.$disconnect();
});

describe("RES member edit", () => {
  it("saves a new name and email of a member without directory origin with one audit row holding before and after", async () => {
    viewer = as(co.admin, "manager");
    const before = await rowOf(co.own);
    const r = await save(co.own, "  Olivia Own  ", "Olivia.Own@Fixed.example");
    expect(r).toEqual({ saved: true });
    const after = await rowOf(co.own);
    expect(after.name).toBe("Olivia Own");
    expect(after.email).toBe("olivia.own@fixed.example");
    const rows = await audits();
    expect(rows).toHaveLength(1);
    expect(rows[0].actorUserId).toBe(co.admin);
    expect(rows[0].targetId).toBe(co.own);
    expect(rows[0].changes).toEqual({ name: { before: before.name, after: "Olivia Own" }, email: { before: before.email, after: "olivia.own@fixed.example" } });

    // Only the changed field is recorded; nothing changed writes nothing.
    expect((await save(co.own, "Olivia Own", "olivia.own@fixed.example")).error).toBeUndefined();
    expect(await audits()).toHaveLength(1);
    await save(co.own, "Olivia Own", "olivia@fixed.example");
    const last = (await audits()).at(-1)!;
    expect(last.changes).toEqual({ email: { before: "olivia.own@fixed.example", after: "olivia@fixed.example" } });
  });

  it("refuses a directory member, a non-admin, an address another member has and a bad address, with nothing written", async () => {
    const snapshot = async () => ({ users: await db.user.findMany({ where: { companyId: co.id }, orderBy: { id: "asc" } }), audits: await audits() });
    const before = await snapshot();

    viewer = as(co.admin, "manager");
    expect((await save(co.directory, "Changed", "changed@res.example")).error).toMatch(/directory/i);
    const other = await rowOf(co.other);
    expect((await save(co.own, "Olivia Own", other.email.toUpperCase())).error).toMatch(/already has/i);
    expect((await save(co.own, "Olivia Own", "nonsense")).error).toMatch(/not an email/i);
    expect((await save(co.own, "   ", "x@y.example")).error).toMatch(/name is required/i);
    expect((await save("no-such-user", "X", "x@y.example")).error).toMatch(/no such person/i);

    viewer = as(co.leader, "leader");
    expect((await save(co.other, "Changed", "changed@res.example")).error).toMatch(/only a manager/i);
    viewer = null;
    expect((await save(co.other, "Changed", "changed@res.example")).error).toMatch(/only a manager/i);

    expect(await snapshot()).toEqual(before);
  });

  it("refuses a pseudonymised member", async () => {
    viewer = as(co.admin, "manager");
    await db.pseudonym.create({ data: { companyId: co.id, userId: co.other, number: 1, label: "Former member #1" } });
    const before = await rowOf(co.other);
    expect((await save(co.other, "Changed", "changed@res.example")).error).toMatch(/pseudonymised/i);
    expect(await rowOf(co.other)).toEqual(before);
    await db.pseudonym.deleteMany({ where: { companyId: co.id } });
  });

  it("a failed audit write leaves the member unchanged", async () => {
    viewer = as(co.admin, "manager");
    const before = await rowOf(co.own);
    const count = (await audits()).length;
    const audit = await import("@/server/audit/record");
    const spy = vi.spyOn(audit, "recordAudit").mockRejectedValueOnce(new Error("disk full"));
    const r = await save(co.own, "Never Saved", "never@saved.example");
    spy.mockRestore();
    expect(r.error).toMatch(/audit trail/i);
    expect(await rowOf(co.own)).toEqual(before);
    expect(await audits()).toHaveLength(count);
  });
});
