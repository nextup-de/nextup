// OVL-A1 (B2): absence through the server actions against a real Postgres (plan OVL, D15, D19, D31): a person, the holder of the seat directly above them and a
// company admin set and end an absence; a user or a span of another company is refused; the clock's hand-over can be taken back by the person it was taken from; and
// none of OVL's six events comes through appendEventAction.
import { afterAll, beforeAll, beforeEach, expect, it, vi } from "vitest";
import type { Viewer } from "@/features/auth/session";
import { translate } from "@/i18n";
import { workdayOf } from "@/features/clock/calendar";
import { DEFAULT_CALENDAR } from "@/features/clock";
import { getDb } from "@/lib/db/client";
import { appendEventRow } from "@/lib/db/events";
import { ovlCompany, viewerOf, type OvlCompany } from "./ovl-company";

let viewer: Viewer | null = null;
vi.mock("next/headers", () => ({ headers: async () => new Headers(), cookies: async () => ({ get: () => undefined, set: () => {}, delete: () => {} }) }));
vi.mock("next/cache", () => ({ revalidatePath: vi.fn() }));
vi.mock("@/features/auth/session", () => ({ getViewerFor: vi.fn(async (slug: string) => (viewer && viewer.companySlug === slug ? viewer : null)) }));

const { setAway, endAway, takeBack, listAwayTargets } = await import("@/server/actions/overload");
const { appendEventAction } = await import("@/server/actions/events");

const db = getDb();
let a: OvlCompany;
let b: OvlCompany;
const today = workdayOf(new Date(), DEFAULT_CALENDAR);
const asA = (userId: string, name: string, role: Viewer["role"]) => (viewer = viewerOf(a, userId, name, role));
const rows = (co: OvlCompany, type: string) => db.caseEvent.findMany({ where: { companyId: co.id, type }, orderBy: { seq: "asc" } });
const spanOf = async (co: OvlCompany) => (await rows(co, "person.away")).at(-1)!;

beforeAll(async () => {
  a = await ovlCompany("ovl-away-a");
  b = await ovlCompany("ovl-away-b");
});
beforeEach(() => { viewer = null; });
afterAll(async () => {
  await db.company.deleteMany({ where: { slug: { in: ["ovl-away-a", "ovl-away-b"] } } });
  await db.$disconnect();
});

it("OVL away writes person.away with awayId and no reason", async () => {
  asA(a.b1, "Holder One", "leader");
  expect(await setAway({ slug: a.slug, userId: a.b1, from: today, to: today + 2 })).toEqual({ ok: true });
  const row = await spanOf(a);
  // The awayId is the event's own id, setBy the viewer's user id, both set by the server; the payload holds a person and two days.
  expect(row).toMatchObject({ type: "person.away", targetId: null, actorUserId: a.b1, source: "app" });
  expect(row.payload).toEqual({ userId: a.b1, from: today, to: today + 2, awayId: row.id, setBy: a.b1 });
  // A key the client sent beyond these is refused, and so are days that are not whole working days of a span that starts today or later.
  expect(await setAway({ slug: a.slug, userId: a.b1, from: today, to: today + 2, reason: "holiday" } as never)).toMatchObject({ ok: false });
  expect(await setAway({ slug: a.slug, userId: a.b1, from: today - 1, to: today + 2 })).toEqual({ ok: false, error: translate("en", "overload.away.errRange") });
  expect(await setAway({ slug: a.slug, userId: a.b1, from: today + 0.5, to: today + 2 })).toEqual({ ok: false, error: translate("en", "overload.err.badDay") });
  expect(await setAway({ slug: a.slug, userId: a.b1, from: today, to: today + 121 })).toEqual({ ok: false, error: translate("en", "overload.away.errRange") });
  expect(await rows(a, "person.away")).toHaveLength(1);
  // Without a session nothing is written.
  viewer = null;
  expect(await setAway({ slug: a.slug, userId: a.b1, from: today, to: today + 2 })).toMatchObject({ ok: false });
});

it("OVL away writes person.back for the own user of the span", async () => {
  asA(a.b1, "Holder One", "leader");
  const span = await spanOf(a);
  expect(await endAway({ slug: a.slug, awayId: span.id })).toEqual({ ok: true });
  const back = (await rows(a, "person.back")).at(-1)!;
  // The person is the span's own, never an id from the client; the span ends today.
  expect(back).toMatchObject({ targetId: null, actorUserId: a.b1 });
  expect(back.payload).toEqual({ userId: a.b1, awayId: span.id });
  // A span that has ended, and an id that is no span, are refused.
  expect(await endAway({ slug: a.slug, awayId: span.id })).toEqual({ ok: false, error: translate("en", "overload.err.notAway") });
  expect(await endAway({ slug: a.slug, awayId: "nothing" })).toEqual({ ok: false, error: translate("en", "overload.err.notAway") });
  // Someone with no right to it cannot end another person's span.
  asA(a.b2, "Holder Two", "leader");
  expect(await setAway({ slug: a.slug, userId: a.b1, from: today, to: today + 3 })).toEqual({ ok: false, error: translate("en", "overload.away.errRights") });
  asA(a.b1, "Holder One", "leader");
  expect(await setAway({ slug: a.slug, userId: a.b1, from: today, to: today + 3 })).toEqual({ ok: true });
  const open = await spanOf(a);
  asA(a.b2, "Holder Two", "leader");
  expect(await endAway({ slug: a.slug, awayId: open.id })).toEqual({ ok: false, error: translate("en", "overload.away.errRights") });
  asA(a.b1, "Holder One", "leader");
  expect(await endAway({ slug: a.slug, awayId: open.id })).toEqual({ ok: true });
});

it("OVL away refuses endAway with an awayId of another company", async () => {
  viewer = viewerOf(b, b.b1, "Holder One", "leader");
  expect(await setAway({ slug: b.slug, userId: b.b1, from: today, to: today + 2 })).toEqual({ ok: true });
  const theirs = await spanOf(b);
  // A's admin knows B's awayId: it is no span of A's company, and nothing is written in either.
  asA(a.admin, "Admin", "manager");
  const before = [(await rows(a, "person.back")).length, (await rows(b, "person.back")).length];
  expect(await endAway({ slug: a.slug, awayId: theirs.id })).toEqual({ ok: false, error: translate("en", "overload.err.notAway") });
  expect([(await rows(a, "person.back")).length, (await rows(b, "person.back")).length]).toEqual(before);
});

it("OVL away refuses setAway for a user of another company", async () => {
  asA(a.admin, "Admin", "manager");
  const before = (await rows(a, "person.away")).length + (await rows(b, "person.away")).length;
  expect(await setAway({ slug: a.slug, userId: b.b1, from: today, to: today + 2 })).toEqual({ ok: false, error: translate("en", "overload.away.errTarget") });
  expect(await setAway({ slug: a.slug, userId: "nobody", from: today, to: today + 2 })).toEqual({ ok: false, error: translate("en", "overload.away.errTarget") });
  // A user who is no longer active is no target either.
  await db.user.updateMany({ where: { id: a.member, companyId: a.id }, data: { active: false } });
  expect(await setAway({ slug: a.slug, userId: a.member, from: today, to: today + 2 })).toEqual({ ok: false, error: translate("en", "overload.away.errTarget") });
  await db.user.updateMany({ where: { id: a.member, companyId: a.id }, data: { active: true } });
  expect((await rows(a, "person.away")).length + (await rows(b, "person.away")).length).toBe(before);
});

it("OVL away lets the holder of the seat directly above set and end a span", async () => {
  asA(a.above, "Seat Above", "member"); // app role member: the seat decides, not the role
  expect(await setAway({ slug: a.slug, userId: a.b2, from: today, to: today + 4 })).toEqual({ ok: true });
  const row = await spanOf(a);
  expect(row.payload).toMatchObject({ userId: a.b2, setBy: a.above, awayId: row.id });
  expect(await endAway({ slug: a.slug, awayId: row.id })).toEqual({ ok: true });
  // Not the cover holder next to the desk: a seat of another role below the same boss is not above anyone here.
  asA(a.t, "Cover Holder", "leader");
  expect(await setAway({ slug: a.slug, userId: a.b2, from: today, to: today + 4 })).toEqual({ ok: false, error: translate("en", "overload.away.errRights") });
});

it("OVL away lets a company admin set and end a span", async () => {
  asA(a.admin, "Admin", "manager");
  for (const userId of [a.b1, a.above, a.member]) {
    expect(await setAway({ slug: a.slug, userId, from: today, to: today + 1 })).toEqual({ ok: true });
    const row = await spanOf(a);
    expect(row.payload).toMatchObject({ userId, setBy: a.admin });
    expect(await endAway({ slug: a.slug, awayId: row.id })).toEqual({ ok: true });
    expect((await rows(a, "person.back")).at(-1)!.payload).toEqual({ userId, awayId: row.id });
  }
});

it("OVL away lists the away targets of each actor", async () => {
  // An open span of Holder Two, set by the seat above, shows with the people it concerns and nothing else.
  asA(a.above, "Seat Above", "member");
  expect(await setAway({ slug: a.slug, userId: a.b2, from: today + 1, to: today + 3 })).toEqual({ ok: true });
  const span = await spanOf(a);
  const own = await listAwayTargets({ slug: a.slug });
  expect(own.map((p) => p.name)).toEqual(["Cover Holder", "Holder One", "Holder Two"]);
  expect(own.find((p) => p.userId === a.b2)).toEqual({ userId: a.b2, name: "Holder Two", span: { awayId: span.id, from: today + 1, to: today + 3 } });
  expect(own.find((p) => p.userId === a.b1)!.span).toBeNull();
  expect(Object.keys(own[0]).sort()).toEqual(["name", "span", "userId"]);
  asA(a.admin, "Admin", "manager");
  expect((await listAwayTargets({ slug: a.slug })).map((p) => p.name)).toEqual(["Cover Holder", "Holder One", "Holder Two", "Plain Member", "Raiser", "Seat Above"]);
  asA(a.b1, "Holder One", "leader");
  expect(await listAwayTargets({ slug: a.slug })).toEqual([]);
  asA(a.member, "Plain Member", "member");
  expect(await listAwayTargets({ slug: a.slug })).toEqual([]);
  viewer = null;
  expect(await listAwayTargets({ slug: a.slug })).toEqual([]);
  asA(a.above, "Seat Above", "member");
  expect(await endAway({ slug: a.slug, awayId: span.id })).toEqual({ ok: true });
});

it("OVL away writes case.handed takeback with system:cover and takenBy", async () => {
  // Holder One was away; the clock handed two of their cases to Holder Two; Holder Two touched one of them. They come back.
  const raise = (id: string) => appendEventRow(a.id, { id: `${id}-raised`, day: 0, type: "case.raised", actor: "Raiser", targetId: id, payload: { title: id, routeId: null, assigneeRoleHolderId: a.seatB1 } } as never, { actorUserId: a.raiser });
  const handOver = (id: string) => appendEventRow(a.id, { id: `${id}-away`, day: 0, type: "case.handed", actor: "system:clock", targetId: id, payload: { to: "Holder Two", toRoleHolderId: a.seatB2, why: "away" } } as never);
  for (const id of ["tb-1", "tb-2"]) { await raise(id); await handOver(id); }
  await appendEventRow(a.id, { id: "tb-2-note", day: 0, type: "case.commented", actor: "Holder Two", targetId: "tb-2", payload: { text: "Looking at it" } } as never, { actorUserId: a.b2 });
  asA(a.b1, "Holder One", "leader");
  expect(await setAway({ slug: a.slug, userId: a.b1, from: today, to: today + 5 })).toEqual({ ok: true });
  // While away there is nothing to take back; once back the person takes back the untouched case only.
  expect(await takeBack({ slug: a.slug, caseIds: ["tb-1"] })).toMatchObject({ done: [], refused: [{ caseId: "tb-1", key: "overload.err.nothing" }] });
  expect(await endAway({ slug: a.slug, awayId: (await spanOf(a)).id })).toEqual({ ok: true });
  const out = await takeBack({ slug: a.slug, caseIds: ["tb-1", "tb-2", "tb-gone"] });
  expect(out.done).toEqual(["tb-1"]);
  expect(out.refused.map((r) => [r.caseId, r.key])).toEqual([["tb-2", "overload.err.nothing"], ["tb-gone", "overload.err.nothing"]]);
  const back = (await db.caseEvent.findMany({ where: { companyId: a.id, targetId: "tb-1", type: "case.handed" }, orderBy: { seq: "asc" } })).at(-1)!;
  expect(back).toMatchObject({ actor: "system:cover", actorUserId: null });
  expect(back.payload).toMatchObject({ why: "takeback", takenBy: a.b1, toRoleHolderId: a.seatB1, to: "Holder One" });
  // Taken back once: a second click, another person and a case the cover touched write nothing more.
  expect(await takeBack({ slug: a.slug, caseIds: ["tb-1"] })).toMatchObject({ done: [] });
  asA(a.b2, "Holder Two", "leader");
  expect(await takeBack({ slug: a.slug, caseIds: ["tb-1", "tb-2"] })).toMatchObject({ done: [] });
  expect(await db.caseEvent.count({ where: { companyId: a.id, type: "case.handed", actor: "system:cover" } })).toBe(1);
});

it("OVL away refuses the six OVL types through appendEventAction", async () => {
  asA(a.admin, "Admin", "manager");
  const wrong = translate("en", "overload.err.wrongPath");
  const send = (type: string, target: string | null, payload: Record<string, unknown>) =>
    appendEventAction({ slug: a.slug, id: `direct-${type}`, type: type as never, target, payload });
  // The three the app may append: refused by the hook with the wrong-path sentence.
  expect(await send("person.away", null, { userId: a.b1, from: today, to: today + 1 })).toEqual({ ok: false, error: wrong });
  expect(await send("person.back", null, { userId: a.b1, awayId: "x" })).toEqual({ ok: false, error: wrong });
  expect(await send("desk.covered", a.roleB, { roleId: a.roleB, seatId: a.seatT })).toEqual({ ok: false, error: wrong });
  // The three the clock and the directory write are no app types at all: the action does not know them.
  for (const [type, target, payload] of [["desk.overloaded", a.roleB, { roleId: a.roleB, level: 20 }], ["desk.cleared", a.roleB, { roleId: a.roleB }], ["org.seat.vacant", a.seatB1, { seatId: a.seatB1 }]] as const) {
    expect(await send(type, target, payload)).toMatchObject({ ok: false });
  }
  expect(await db.caseEvent.count({ where: { companyId: a.id, id: { startsWith: "direct-" } } })).toBe(0);
});
