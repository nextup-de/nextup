// OVL-A1 (B3): the seat above an overloaded desk shares its load through the server actions against a real Postgres (plan OVL, D28): it passes cases on and appoints a
// cover seat while the desk is at up or overflow, and nobody else may, nor for a case of another desk. Desk B has 41 open cases and two holders: 21 per holder, up.
import { afterAll, beforeAll, beforeEach, expect, it, vi } from "vitest";
import type { Viewer } from "@/features/auth/session";
import { translate } from "@/i18n";
import { reduce } from "@/features/cases/reducer";
import { seedFor } from "@/features/demo";
import { getDb } from "@/lib/db/client";
import { appendEventRow, loadLog } from "@/lib/db/events";
import { ovlCompany, viewerOf, type OvlCompany } from "./ovl-company";

let viewer: Viewer | null = null;
vi.mock("next/headers", () => ({ headers: async () => new Headers(), cookies: async () => ({ get: () => undefined, set: () => {}, delete: () => {} }) }));
vi.mock("next/cache", () => ({ revalidatePath: vi.fn() }));
vi.mock("@/features/auth/session", () => ({ getViewerFor: vi.fn(async (slug: string) => (viewer && viewer.companySlug === slug ? viewer : null)) }));

const { passForDesk, appointCover } = await import("@/server/actions/overload");

const db = getDb();
const SLUG = "ovl-share";
const CASES = Array.from({ length: 41 }, (_, i) => `sh-${i}`);
const WHY = "The desk is far over its load";
let co: OvlCompany;

const asUser = (userId: string, name: string, role: Viewer["role"]) => (viewer = viewerOf(co, userId, name, role));
const rows = (type: string) => db.caseEvent.findMany({ where: { companyId: co.id, type }, orderBy: { seq: "asc" } });
const passes = async (caseId: string) => reduce(await seedFor(SLUG), await loadLog(co.id)).cases.find((c) => c.id === caseId)!.passes;

beforeAll(async () => {
  co = await ovlCompany(SLUG);
  // 41 open cases on desk B (the seats alternate), one on desk T, and the open episode the clock would have written at the up level.
  for (const [i, id] of CASES.entries()) {
    await appendEventRow(co.id, { id: `${id}-raised`, day: 0, type: "case.raised", actor: "Raiser", targetId: id, payload: { title: id, routeId: null, assigneeRoleHolderId: i % 2 === 0 ? co.seatB1 : co.seatB2 } } as never, { actorUserId: co.raiser });
  }
  await appendEventRow(co.id, { id: "sh-t-raised", day: 0, type: "case.raised", actor: "Raiser", targetId: "sh-t", payload: { title: "on desk T", routeId: null, assigneeRoleHolderId: co.seatT } } as never, { actorUserId: co.raiser });
  await appendEventRow(co.id, { id: "sh-overloaded", day: 0, type: "desk.overloaded", actor: "system:clock", targetId: co.roleB, payload: { roleId: co.roleB, level: 20, perHolder: 21, holders: 2 } } as never);
});
beforeEach(() => { viewer = null; });
afterAll(async () => {
  await db.company.deleteMany({ where: { slug: SLUG } });
  await db.$disconnect();
});

it("OVL share lets the seat above pass two cases of the overloaded desk", async () => {
  // The seat above holds the app role member and no seat of desk B: the seat decides.
  asUser(co.above, "Seat Above", "member");
  const out = await passForDesk({ slug: SLUG, roleId: co.roleB, caseIds: ["sh-0", "sh-1"], toSeatId: co.seatT, why: WHY });
  expect(out).toEqual({ done: ["sh-0", "sh-1"], refused: [] });
  const handed = (await rows("case.handed")).filter((r) => r.targetId === "sh-0" || r.targetId === "sh-1");
  expect(handed).toHaveLength(2);
  // A person's pass: under the viewer's name and user id, with the reason and the seat; NOR counts it.
  for (const row of handed) {
    expect(row).toMatchObject({ actor: "Seat Above", actorUserId: co.above });
    expect(row.payload).toMatchObject({ toRoleHolderId: co.seatT, why: WHY });
  }
  expect(await passes("sh-0")).toBe(1);
  expect(await passes("sh-1")).toBe(1);
  // The pass rules still apply: a reason that is too short is refused for the case, and the others go on.
  const short = await passForDesk({ slug: SLUG, roleId: co.roleB, caseIds: ["sh-2"], toSeatId: co.seatT, why: "short" });
  expect(short.done).toEqual([]);
  expect(short.refused).toMatchObject([{ caseId: "sh-2", key: "overload.inbox.refused" }]);
  expect(await passes("sh-2")).toBe(0);
});

it("OVL share lets the seat above appoint a cover seat", async () => {
  asUser(co.above, "Seat Above", "member");
  expect(await appointCover({ slug: SLUG, roleId: co.roleB, seatId: co.seatT })).toEqual({ done: [co.seatT], refused: [] });
  const row = (await rows("desk.covered")).at(-1)!;
  expect(row).toMatchObject({ targetId: co.roleB, actorUserId: co.above });
  expect(row.payload).toEqual({ roleId: co.roleB, seatId: co.seatT });
  // A seat of the desk's own role, an unknown seat and a seat whose person is away are no cover.
  expect(await appointCover({ slug: SLUG, roleId: co.roleB, seatId: co.seatB2 })).toMatchObject({ done: [], refused: [{ caseId: co.seatB2, key: "overload.err.nothing" }] });
  expect(await appointCover({ slug: SLUG, roleId: co.roleB, seatId: "seat_gone" })).toMatchObject({ done: [] });
  await db.user.updateMany({ where: { id: co.t, companyId: co.id }, data: { active: false } });
  expect(await appointCover({ slug: SLUG, roleId: co.roleB, seatId: co.seatT })).toMatchObject({ done: [] });
  await db.user.updateMany({ where: { id: co.t, companyId: co.id }, data: { active: true } });
  expect(await rows("desk.covered")).toHaveLength(1);
});

it("OVL share refuses a case of another desk", async () => {
  asUser(co.above, "Seat Above", "member");
  // Case sh-t is on desk T: desk B's overload is no reason to move it. A case that does not exist is refused the same way.
  const out = await passForDesk({ slug: SLUG, roleId: co.roleB, caseIds: ["sh-t", "sh-none"], toSeatId: co.seatT, why: WHY });
  expect(out.done).toEqual([]);
  expect(out.refused).toEqual([{ caseId: "sh-t", key: "overload.err.notOnDesk" }, { caseId: "sh-none", key: "overload.err.notOnDesk" }]);
  expect(await rows("case.handed")).toHaveLength(2); // only the two passes of the first test
});

it("OVL share refuses a member who is not above the desk", async () => {
  const refusedFor = async (userId: string, name: string, role: Viewer["role"]) => {
    asUser(userId, name, role);
    const pass = await passForDesk({ slug: SLUG, roleId: co.roleB, caseIds: ["sh-3"], toSeatId: co.seatT, why: WHY });
    const cover = await appointCover({ slug: SLUG, roleId: co.roleB, seatId: co.seatT });
    return [pass.done.length, pass.refused[0]?.key, pass.error, cover.done.length, cover.refused[0]?.key];
  };
  const notAbove = [0, "overload.err.notAbove", translate("en", "overload.err.notAbove"), 0, "overload.err.notAbove"];
  expect(await refusedFor(co.member, "Plain Member", "member")).toEqual(notAbove);
  expect(await refusedFor(co.b1, "Holder One", "leader")).toEqual(notAbove); // a holder of the desk itself is not the seat above it
  expect(await refusedFor(co.t, "Cover Holder", "leader")).toEqual(notAbove); // nor is a holder of another desk
  // No session: nothing, and a viewer who is a company admin may.
  viewer = null;
  expect(await passForDesk({ slug: SLUG, roleId: co.roleB, caseIds: ["sh-3"], toSeatId: co.seatT, why: WHY })).toMatchObject({ done: [] });
  asUser(co.admin, "Admin", "manager");
  expect(await passForDesk({ slug: SLUG, roleId: co.roleB, caseIds: ["sh-3"], toSeatId: co.seatT, why: WHY })).toEqual({ done: ["sh-3"], refused: [] });
});

it("OVL share refuses the seat above once the desk is under 20", async () => {
  asUser(co.above, "Seat Above", "member");
  // 41 cases, three passed so far: 38 open on two holders is 19 each.
  const done = (await rows("case.handed")).length;
  expect(done).toBe(3);
  const out = await passForDesk({ slug: SLUG, roleId: co.roleB, caseIds: ["sh-4"], toSeatId: co.seatT, why: WHY });
  expect(out.done).toEqual([]);
  expect(out.refused).toEqual([{ caseId: "sh-4", key: "overload.err.notOverloaded" }]);
  expect(out.error).toBe(translate("en", "overload.err.notOverloaded"));
  expect(await appointCover({ slug: SLUG, roleId: co.roleB, seatId: co.seatT })).toMatchObject({ done: [], refused: [{ key: "overload.err.notOverloaded" }] });
  // The company admin is bound by the level as well.
  asUser(co.admin, "Admin", "manager");
  expect(await passForDesk({ slug: SLUG, roleId: co.roleB, caseIds: ["sh-4"], toSeatId: co.seatT, why: WHY })).toMatchObject({ done: [] });
  expect(await rows("case.handed")).toHaveLength(3);
});
