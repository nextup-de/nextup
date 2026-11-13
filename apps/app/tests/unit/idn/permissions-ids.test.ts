import { describe, expect, it } from "vitest";
import { meFor, meOfSeat, NOBODY, type Actor } from "@/features/auth/identity";
import type { CaseEvent } from "@/features/cases/events";
import { mayAppend } from "@/features/cases/permissions";
import { reduce } from "@/features/cases/reducer";
import { fallbackSeat, stampEvent } from "@/features/cases/stamp";
import { LOCAL_SEED } from "@/features/demo";
import { createT } from "@/i18n";

const r2 = LOCAL_SEED.routes.find((r) => r.id === "r2")!;
const raised: CaseEvent = {
  id: "e1", ts: 0, day: 0, type: "case.raised", actor: "Raiser", actorUserId: "u_raiser", target: "c_new",
  payload: { title: "x", routeId: "r2", assignee: r2.owner.name },
};
const state = reduce(LOCAL_SEED, { events: [raised], day: 0 });
const ownerMe = meOfSeat(r2.ownerSeatId!, LOCAL_SEED.seats);
const act = (name: string, userId: string | null, me = NOBODY): Actor => ({ role: "leader", name, handle: null, userId, me });
const ev = (type: string, payload: Record<string, unknown> = {}) => ({ type, target: "c_new", payload });
const seatId = LOCAL_SEED.seats[0].id;

describe("IDN permissions on ids", () => {
  it("a leader holding the owner role decides and hands over; the same name without the seat may not", () => {
    const holder = act("Anyone", ownerMe.userId, ownerMe);
    const no = { answer: "no", category: "no-fit", reason: "The budget for this year is already spent on the new line." };
    const pass = { to: "B", toRoleHolderId: seatId, why: "It is the other desk's area" };
    expect(mayAppend(holder, ev("case.decided", no), state).ok).toBe(true);
    expect(mayAppend(holder, ev("case.handed", pass), state).ok).toBe(true);
    const sameName = act(r2.owner.name, null, NOBODY);
    expect(mayAppend(sameName, ev("case.decided", no), state).ok).toBe(false);
    expect(mayAppend(sameName, ev("case.handed", pass), state).ok).toBe(false);
  });

  it("the raiser by user id answers and revises; another user with the same label may not", () => {
    const raiser = { ...act("Raiser", "u_raiser", meFor("u_raiser", LOCAL_SEED.seats)), role: "member" as const };
    const twin = { ...act("Raiser", "u_twin"), role: "member" as const };
    expect(mayAppend(raiser, ev("case.answered"), state).ok).toBe(true);
    expect(mayAppend(raiser, ev("case.revised", { body: "better" }), state).ok).toBe(true);
    expect(mayAppend(twin, ev("case.answered"), state).ok).toBe(false);
    expect(mayAppend(twin, ev("case.revised", { body: "better" }), state).ok).toBe(false);
  });

  it("a hand-over to an unknown seat is refused", () => {
    const holder = act("Anyone", ownerMe.userId, ownerMe);
    const text = createT("en")("cases.permHandSeat");
    for (const payload of [{ to: "B", toRoleHolderId: "nope" }, { to: "B" }]) {
      expect(mayAppend(holder, ev("case.handed", payload), state)).toEqual({ ok: false, error: text });
    }
  });

  it("stampEvent sets the route owner seat whatever the client sent", () => {
    const p = stampEvent("case.raised", { routeId: "r2", assigneeRoleHolderId: "forged" }, LOCAL_SEED);
    expect(p.assigneeRoleHolderId).toBe(r2.ownerSeatId);
    // No route: the fallback desk (decisions Q2.1, Q1.9), never what the client sent; null only without an org chart.
    const none = stampEvent("case.raised", { routeId: "nope", assigneeRoleHolderId: "forged", assignee: "Triage desk" }, LOCAL_SEED);
    const head = fallbackSeat(LOCAL_SEED);
    expect([none.assigneeRoleHolderId, none.assignee]).toEqual([head?.id ?? null, head?.label ?? "Triage desk"]);
    expect(stampEvent("case.raised", { routeId: "nope", assigneeRoleHolderId: "forged" }, { routes: LOCAL_SEED.routes }).assigneeRoleHolderId).toBeNull();
    const other = { to: "x", toRoleHolderId: "keep" };
    expect(stampEvent("case.handed", other, LOCAL_SEED)).toBe(other);
  });
});

describe("the fallback desk for a raise no route owns", () => {
  const role = (id: string, reportsToId: string | null) => ({ id, orgUnitId: "u", reportsToId });
  const seat = (id: string, roleId: string, userId: string | null, sort: number) => ({ id, roleId, label: id, userId, sort });
  const roles = [role("plant", null), role("quality", "plant"), role("line3", "quality"), role("stray", null)];

  it("is the occupied seat at the head of the org chart, not a stray role without a boss", () => {
    const seats = [seat("s_stray", "stray", "u1", 0), seat("s_q", "quality", "u2", 1), seat("s_plant", "plant", "u3", 2)];
    expect(fallbackSeat({ roles, seats })?.id).toBe("s_plant");
  });

  it("skips a vacant head and takes the next head with someone on it; ties go to the seat listed first", () => {
    const seats = [seat("s_plant", "plant", null, 0), seat("s_stray", "stray", "u1", 1)];
    expect(fallbackSeat({ roles, seats })?.id).toBe("s_stray");
    const twins = [role("a", null), role("b", null)];
    expect(fallbackSeat({ roles: twins, seats: [seat("s_b", "b", "u1", 0), seat("s_a", "a", "u2", 1)] })?.id).toBe("s_b");
  });

  it("is nobody without an org chart, without seats, or when the boss of every role is unknown but nobody sits there", () => {
    expect(fallbackSeat({ seats: [seat("s", "plant", "u", 0)] })).toBeNull();
    expect(fallbackSeat({ roles })).toBeNull();
    expect(fallbackSeat({ roles: [role("x", "gone")], seats: [seat("s", "x", null, 0)] })).toBeNull();
  });

  it("a route without an owner seat falls back too", () => {
    const routes = LOCAL_SEED.routes.map((r) => (r.id === "r2" ? { ...r, ownerSeatId: null } : r));
    const seats = [seat("s_plant", "plant", "u3", 0)];
    expect(stampEvent("case.raised", { routeId: "r2" }, { routes, roles, seats })).toMatchObject({ assigneeRoleHolderId: "s_plant", assignee: "s_plant" });
  });
});
