import { afterAll, beforeAll, beforeEach, describe, expect, it, vi } from "vitest";
import type { Viewer } from "@/features/auth/session";
import { toSeedJson } from "@/features/demo/parse";
import { SEED } from "@/features/demo/seed";

let viewer: Viewer | null = null;
vi.mock("@/features/auth/session", () => ({ getViewerFor: vi.fn(async (slug: string) => (viewer && viewer.companySlug === slug ? viewer : null)) }));
vi.mock("next/cache", () => ({ revalidatePath: vi.fn() }));
vi.mock("@/server/mail", () => ({ sendMail: vi.fn(async () => ({ ok: true })) }));

import { getDb } from "@/lib/db/client";
import { addMemberAction, deactivateMemberAction, deleteMemberAction, inviteMemberAction, issueMemberCodeAction, memberSeatAction, setMemberRoleAction } from "@/server/actions/members";
import { saveCalendarAction, saveCompanyAction, saveRulesAction } from "@/server/actions/settings/company";
import { addGoalAction } from "@/server/actions/settings/goals";
import { saveNotificationsSwitchAction, retryOutboxAction } from "@/server/actions/settings/notifications";
import { addRoleAction, addUnitAction, linkSeatAction, saveRouteAction } from "@/server/actions/settings/org";
import { resetTotpAction } from "@/server/actions/settings/totp-reset";

const db = getDb();
const A = "gdp-set-a";
const B = "gdp-set-b";
type Co = { id: string; slug: string; manager: string; manager2: string; member: string; leaver: string; plain: string; seat: string };
const co: Record<"a" | "b", Co> = { a: null as never, b: null as never };

const NAMES = ["Zora Quillfeather", "Bastian Moorhen", "Ottilie Vandersloot", "Percival Dunmore", "Xenia Brightwater", "Ulrich Penhallow"];
const EMAILS = ["zora.quillfeather", "bastian.moorhen", "ottilie.vandersloot", "percival.dunmore", "xenia.brightwater", "ulrich.penhallow"];

const form = (o: Record<string, string | string[]>) => {
  const f = new FormData();
  for (const [k, v] of Object.entries(o)) for (const x of Array.isArray(v) ? v : [v]) f.append(k, x);
  return f;
};
const as = (c: Co, userId: string, role: Viewer["role"]): Viewer => ({
  userId, companyId: c.id, companySlug: c.slug, name: "Shown Name", handle: null, role, epoch: 0, issuedAt: 0,
});

let n = 0;
async function makeCompany(slug: string): Promise<Co> {
  const c = await db.company.create({ data: { slug, name: `Co ${slug}`, seedJson: toSeedJson(SEED) as object } });
  const mk = (name: string, role: string, mail: string) =>
    db.user.create({ data: { companyId: c.id, name, email: `${mail}@${slug}.example`, role }, select: { id: true } });
  const u = await db.orgUnit.create({ data: { companyId: c.id, key: "OPS", name: "Operations", kind: "dept", headcount: 2, sort: 0 } });
  const r = await db.orgRole.create({ data: { companyId: c.id, orgUnitId: u.id, title: "Ops lead", decides: [], sort: 0 } });
  const seat = await db.orgRoleHolder.create({ data: { companyId: c.id, roleId: r.id, name: "Ops seat", sort: 0 } });
  const i = n++ * 3;
  const manager = await mk(NAMES[i % 6], "manager", EMAILS[i % 6]);
  const manager2 = await mk(NAMES[(i + 1) % 6], "manager", EMAILS[(i + 1) % 6]);
  const member = await mk(NAMES[(i + 2) % 6], "member", EMAILS[(i + 2) % 6]);
  const leaver = await db.user.create({ data: { companyId: c.id, name: "Leaver Person", email: `leaver@${slug}.example`, role: "member", active: false }, select: { id: true } });
  const plain = await mk("Plain Person", "member", "plain");
  await db.user.update({ where: { id: manager2.id, companyId: c.id }, data: { totpSecretSealed: "sealed", totpEnabledAt: new Date() } });
  return { id: c.id, slug, manager: manager.id, manager2: manager2.id, member: member.id, leaver: leaver.id, plain: plain.id, seat: seat.id };
}

const rows = (companyId: string) => db.auditEvent.findMany({ where: { companyId }, orderBy: { at: "asc" } });
const last = async (companyId: string) => (await rows(companyId)).at(-1)!;

beforeAll(async () => {
  await db.company.deleteMany({ where: { slug: { in: [A, B] } } });
  co.a = await makeCompany(A);
  co.b = await makeCompany(B);
});
beforeEach(() => { viewer = null; });
afterAll(async () => {
  await db.company.deleteMany({ where: { slug: { in: [A, B] } } });
  await db.$disconnect();
});

describe("GDP settings audit", () => {
  it("a manager's every action writes one audit row with the admin as actor and no names", async () => {
    const a = co.a;
    viewer = as(a, a.manager, "manager");
    const expectRow = async (action: string, kind: string | null, before: number) => {
      const all = await rows(a.id);
      expect(all).toHaveLength(before + 1);
      const row = all.at(-1)!;
      expect(row).toMatchObject({ actorKind: "admin", actorUserId: a.manager, action, targetKind: kind, source: "settings" });
      return row;
    };
    const count = async () => (await rows(a.id)).length;
    const step = async (action: string, kind: string | null, run: () => Promise<unknown>) => {
      const before = await count();
      await run();
      return expectRow(action, kind, before);
    };

    const company = await step("audit.company.saved", "company", async () =>
      expect(await saveCompanyAction({}, form({ slug: A, name: "Renamed Co", mark: "RC", vision: "v", mission: "m", principles: "one", businessModel: "b", complianceRules: "c" }))).toEqual({ ok: true }));
    expect(company.targetId).toBe(a.id);
    expect(Object.keys(company.changes as object)).toContain("name");

    await step("audit.settings.rules", "company", async () =>
      expect(await saveRulesAction({}, form({
        slug: A, promiseDays: "4", outcomeDays: "20", spendLimitEur: "900", spendText: "Up to 900 euros",
        discussEveryDays: "5", discussMaxRounds: "2", fastLaneEur: "300", measureDays: "45", tolerancePct: "4", rewardRule: "fixed", rewardAmountEur: "150",
      }))).toEqual({ ok: true }));
    await step("audit.settings.calendar", "company", async () =>
      expect(await saveCalendarAction({}, form({ slug: A, region: "DE-BY", workdays: ["1", "2", "3", "4"], extraHolidays: "2026-12-24", extraWorkdays: "" }))).toEqual({ ok: true }));

    const unit = await step("audit.settings.org", "unit", async () =>
      expect(await addUnitAction(A, { key: "ENG", name: "Engineering", kind: "dept", headcount: 3, parentId: null })).toEqual({ ok: true }));
    const unitRow = await db.orgUnit.findFirstOrThrow({ where: { companyId: a.id, key: "ENG" } });
    expect(unit.targetId).toBe(unitRow.id);
    await step("audit.settings.org", "role", async () =>
      expect(await addRoleAction(A, { orgUnitId: unitRow.id, title: "Eng lead", reportsToId: null, decides: ["tools"], spendLimitEur: 500 })).toEqual({ ok: true }));
    const role = await db.orgRole.findFirstOrThrow({ where: { companyId: a.id, title: "Eng lead" } });
    const route = await step("audit.settings.routing", "route", async () =>
      expect(await saveRouteAction(A, { key: "r1", type: "Tools", keywords: ["tool"], ownerRoleId: role.id, deputyRoleId: null, buddyRoleId: null, wait: "1d" })).toEqual({ ok: true }));
    expect(route.targetId).toBe((await db.routingRule.findFirstOrThrow({ where: { companyId: a.id, key: "r1" } })).id);

    const seat = await step("audit.member.seat", "seat", async () =>
      expect(await linkSeatAction(A, a.seat, a.member)).toEqual({ ok: true }));
    expect(seat.targetId).toBe(a.seat);
    expect(seat.changes).toEqual({ userId: { before: null, after: a.member } });

    await step("audit.settings.goals", "goal", async () =>
      expect(await addGoalAction(A, { title: "Fewer errors", kpi: "errors", target: "10", period: "Q1", orgUnitId: null, keywords: ["error"] })).toEqual({ ok: true }));

    await step("audit.settings.notifications", "company", async () =>
      expect(await saveNotificationsSwitchAction({}, form({ slug: A, on: "off" }))).toEqual({ ok: true }));
    // A retry of one outbox row writes nothing.
    const before = await count();
    await retryOutboxAction({}, form({ slug: A, id: "nope" }));
    expect(await count()).toBe(before);

    await step("audit.member.totp_reset", "user", async () => expect(await resetTotpAction(A, a.manager2)).toEqual({ ok: true }));
    expect((await last(a.id)).targetId).toBe(a.manager2);

    const added = await step("audit.member.added", "user", async () => {
      expect((await addMemberAction({}, form({ slug: A, name: "Added Person", email: "added.person@example.com", role: "member", dept: "OPS" }))).added).toBeTruthy();
    });
    const addedUser = await db.user.findFirstOrThrow({ where: { companyId: a.id, name: "Added Person" } });
    expect(added.targetId).toBe(addedUser.id);
    await step("audit.member.invited", "user", async () => {
      expect((await inviteMemberAction({}, form({ slug: A, name: "Invited Person", email: "invited.person@example.com", role: "member", dept: "OPS" }))).added).toBeTruthy();
    });

    const code = await step("audit.member.code", "user", async () => {
      expect((await issueMemberCodeAction({}, form({ slug: A, userId: a.member }))).code).toBeTruthy();
    });
    expect(code.changes).toEqual({});
    const roleRow = await step("audit.member.role", "user", async () => {
      expect((await setMemberRoleAction({}, form({ slug: A, userId: a.member, role: "leader" }))).error).toBeUndefined();
    });
    expect(roleRow.changes).toEqual({ role: { before: "member", after: "leader" } });

    await step("audit.member.deactivated", "user", async () => {
      expect((await deactivateMemberAction({}, form({ slug: A, userId: a.member }))).error).toBeUndefined();
    });
    const del = await step("audit.member.deleted", "user", async () => {
      expect((await deleteMemberAction({}, form({ slug: A, userId: a.leaver }))).error).toBeUndefined();
    });
    expect(del.targetId).toBe(a.leaver);
    // The row stays after the user is gone.
    expect(await db.user.count({ where: { id: a.leaver, companyId: a.id } })).toBe(0);
    expect(await db.auditEvent.count({ where: { id: del.id } })).toBe(1);

    // No member's name or email occurs in any row.
    const dump = JSON.stringify(await rows(a.id)).toLowerCase();
    const users = await db.user.findMany({ where: { companyId: a.id } });
    for (const needle of [...NAMES, ...EMAILS, ...users.flatMap((u) => [u.name, u.email]), "added person", "invited person", "leaver person", "plain person"]) {
      expect(dump).not.toContain(needle.toLowerCase());
    }
  });

  it("a member calling an action is refused and nothing is written", async () => {
    const a = co.a;
    const before = await db.auditEvent.count();
    viewer = as(a, a.plain, "member");
    expect(await saveCompanyAction({}, form({ slug: A, name: "Hacked" }))).toEqual({ error: "settingsCompany.forbidden" });
    expect(await addUnitAction(A, { key: "HAX", name: "Hax", kind: "dept", headcount: 1, parentId: null })).toEqual({ ok: false, error: "settingsOrg.errForbidden" });
    expect(await addGoalAction(A, { title: "x", kpi: "x", target: "x", period: "x", orgUnitId: null, keywords: ["x"] })).toEqual({ ok: false, error: "settingsGoals.errForbidden" });
    expect(await saveNotificationsSwitchAction({}, form({ slug: A, on: "on" }))).toEqual({ error: "settingsCompany.forbidden" });
    expect(await resetTotpAction(A, a.manager)).toEqual({ ok: false, error: "settings.totpResetForbidden" });
    expect((await issueMemberCodeAction({}, form({ slug: A, userId: a.manager }))).error).toBeTruthy();
    expect((await setMemberRoleAction({}, form({ slug: A, userId: a.manager, role: "member" }))).error).toBeTruthy();
    expect((await deactivateMemberAction({}, form({ slug: A, userId: a.manager }))).error).toBeTruthy();
    expect((await memberSeatAction({}, form({ slug: A, userId: a.manager, seatId: a.seat }))).error).toBeTruthy();
    expect(await db.auditEvent.count()).toBe(before);
  });

  it("nothing is written for the other company", async () => {
    expect(await db.auditEvent.count({ where: { companyId: co.b.id } })).toBe(0);
  });
});
