import { describe, expect, it } from "vitest";
import { meFor, meOfSeat, NOBODY, type Actor } from "@/features/auth/identity";
import type { CaseEvent } from "@/features/cases/events";
import { mayAppend } from "@/features/cases/permissions";
import { reduce } from "@/features/cases/reducer";
import { stampEvent } from "@/features/cases/stamp";
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
    expect(mayAppend(holder, ev("case.decided", { answer: "no" }), state).ok).toBe(true);
    expect(mayAppend(holder, ev("case.handed", { to: "B", toRoleHolderId: seatId }), state).ok).toBe(true);
    const sameName = act(r2.owner.name, null, NOBODY);
    expect(mayAppend(sameName, ev("case.decided", { answer: "no" }), state).ok).toBe(false);
    expect(mayAppend(sameName, ev("case.handed", { to: "B", toRoleHolderId: seatId }), state).ok).toBe(false);
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
    expect(stampEvent("case.raised", { routeId: "nope", assigneeRoleHolderId: "forged" }, LOCAL_SEED).assigneeRoleHolderId).toBeNull();
    const other = { to: "x", toRoleHolderId: "keep" };
    expect(stampEvent("case.handed", other, LOCAL_SEED)).toBe(other);
  });
});
