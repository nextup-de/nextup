// NOR-B1: what the server writes into a person's pass and second look, whatever the client sent (plan NOR, D13, D18). Pure.
import { describe, expect, it } from "vitest";
import type { SeatRow } from "@/features/auth/identity";
import type { ReducedCase } from "@/features/cases/reducer";
import { appealDeskSeat, stampNor, type SeatAboveFn } from "@/features/cases/stamp";
import type { Route } from "@/features/demo/types";

const seats: SeatRow[] = [
  { id: "s_own", roleId: "role_owner", label: "Owner", userId: "u_o", sort: 0 },
  { id: "s_dep", roleId: "role_deputy", label: "Deputy", userId: "u_dep", sort: 1 },
  { id: "s_dep2", roleId: "role_deputy", label: "Deputy Two", userId: "u_dep2", sort: 2 },
  { id: "s_up", roleId: "role_up", label: "Above", userId: "u_up", sort: 3 },
  { id: "s_top", roleId: "role_top", label: "Top", userId: "u_top", sort: 4 },
  { id: "s_other", roleId: "role_other", label: "Other", userId: "u_other", sort: 5 },
  { id: "s_empty", roleId: "role_empty", label: "Empty", userId: null, sort: 6 },
];
const route = (id: string, ownerRoleId: string | null, ownerSeatId: string | null, deputyRoleId: string | null = null, deputySeatId: string | null = null) =>
  ({ id, ownerRoleId, ownerSeatId, deputyRoleId, deputySeatId }) as unknown as Route;
const routes = [route("r_main", "role_owner", "s_own", "role_deputy", "s_dep"), route("r_other", "role_other", "s_other"), route("r_nodeputy", "role_owner", "s_own"), route("r_emptydep", "role_owner", "s_own", "role_empty")];
const TODAY = 400;
const state = { seats, routes, day: TODAY };

// The org: owner and deputy report to "up", "up" reports to "top". Role "other" has nobody above.
const CHAIN: Record<string, string[]> = { role_owner: ["role_up", "role_top"], role_deputy: ["role_up", "role_top"], role_up: ["role_top"], role_empty: ["role_up", "role_top"], role_other: [] };
const above: SeatAboveFn = (roleId, skip) => {
  for (const up of CHAIN[roleId] ?? []) {
    if (skip.includes(up)) continue;
    const seat = seats.find((x) => x.roleId === up && x.userId !== null);
    if (seat) return { id: seat.id, label: seat.label };
  }
  return null;
};

type Case = Pick<ReducedCase, "id" | "passes" | "handed" | "status" | "dueDay" | "assigneeRoleId" | "assigneeSeatId" | "decided" | "routeId">;
const kase = (over: Partial<Case> = {}): ReducedCase => ({
  id: "c_a", passes: 0, handed: [], status: "open", dueDay: TODAY + 5, assigneeRoleId: "role_owner", assigneeSeatId: "s_own", decided: null, routeId: "r_main", ...over,
}) as unknown as ReducedCase;
const passed = (fromSeatId: string | null, toSeatId: string, extra: { back?: boolean } = {}) =>
  ({ from: "x", fromUserId: null, to: "y", toSeatId, why: "A pass of the past", day: 1, fromSeatId, back: false, up: false, ...extra });
const noBy = (userId: string | null) => ({ answer: "no", reason: "A reason that is long enough to stand", note: "", by: "Someone", byUserId: userId, day: TODAY - 1, category: "no-fit", changeIf: "", revisitDay: null, duplicateOf: null }) as unknown as NonNullable<ReducedCase["decided"]>;

describe("NOR rights appeal reopen and stamps", () => {
  describe("a pass", () => {
    it("derives the destination of Not mine from the recorded pass, whatever the client sent", () => {
      const reached = kase({ passes: 1, assigneeRoleId: "role_deputy", assigneeSeatId: "s_dep", handed: [passed("s_own", "s_dep")] });
      const out = stampNor("case.handed", { to: "Forged", toRoleHolderId: "s_top", why: "Not mine, really", back: true, routeId: "r_other" }, reached, state, above);
      expect(out).toMatchObject({ toRoleHolderId: "s_own", to: "Owner", back: true, why: "Not mine, really" });
      expect(out).not.toHaveProperty("routeId");
      // With nothing passed to the case there is no destination to derive: the payload stays, and mayAppend refuses it.
      expect(stampNor("case.handed", { to: "Forged", toRoleHolderId: "s_top", why: "Not mine, really", back: true }, kase(), state, above)).toMatchObject({ toRoleHolderId: "s_top", back: true });
    });

    it("derives the seat of Send up from the desk hierarchy, never the client's, and leaves none when nobody is above", () => {
      const up = stampNor("case.handed", { to: "Forged", toRoleHolderId: "s_other", why: "Needs a decision above us", up: true, routeId: "r_other" }, kase({ passes: 2 }), state, above);
      expect(up).toMatchObject({ toRoleHolderId: "s_up", to: "Above", up: true });
      expect(up).not.toHaveProperty("routeId");
      // The case sits with a desk nobody is above: no seat, so the caller refuses the send-up.
      const none = stampNor("case.handed", { to: "Forged", toRoleHolderId: "s_top", why: "Needs a decision above us", up: true }, kase({ assigneeRoleId: "role_other" }), state, above);
      expect(none).not.toHaveProperty("toRoleHolderId");
      expect(none).not.toHaveProperty("to");
    });

    it("sets the date floor from the rule, also when it was omitted or forged, and takes it away when there is none", () => {
      const pass = { to: "Other", toRoleHolderId: "s_other", why: "It is the other desk's area" };
      expect(stampNor("case.handed", pass, kase({ dueDay: TODAY + 1 }), state, above)).toMatchObject({ dueDay: TODAY + 2 }); // omitted
      expect(stampNor("case.handed", { ...pass, dueDay: TODAY + 99 }, kase({ dueDay: TODAY }), state, above)).toMatchObject({ dueDay: TODAY + 2 }); // forged
      expect(stampNor("case.handed", { ...pass, dueDay: TODAY + 2 }, kase({ dueDay: TODAY + 9 }), state, above)).not.toHaveProperty("dueDay"); // not needed
      expect(stampNor("case.handed", pass, kase({ dueDay: TODAY + 2 }), state, above)).not.toHaveProperty("dueDay");
    });

    it("keeps the flag for an open question only on an asked case: a forged flag grants nothing", () => {
      const pass = { to: "Other", toRoleHolderId: "s_other", why: "It is the other desk's area" };
      expect(stampNor("case.handed", { ...pass, keepsQuestion: true }, kase({ status: "open" }), state, above)).not.toHaveProperty("keepsQuestion");
      expect(stampNor("case.handed", { ...pass, keepsQuestion: true }, kase({ status: "asked" }), state, above)).toMatchObject({ keepsQuestion: true });
      // Omitted on an asked case it stays omitted (mayAppend refuses): the server does not decide for the person.
      expect(stampNor("case.handed", pass, kase({ status: "asked" }), state, above)).not.toHaveProperty("keepsQuestion");
    });

    it("gives a pass the route of the seat it goes to when none came, and leaves a route that came for mayAppend to check", () => {
      const pass = { to: "Other", why: "It is the other desk's area" };
      expect(stampNor("case.handed", { ...pass, toRoleHolderId: "s_other" }, kase(), state, above)).toMatchObject({ routeId: "r_other" });
      expect(stampNor("case.handed", { ...pass, toRoleHolderId: "s_dep" }, kase(), state, above)).toMatchObject({ routeId: "r_main" }); // the deputy seat of a route
      expect(stampNor("case.handed", { ...pass, toRoleHolderId: "s_up" }, kase(), state, above)).not.toHaveProperty("routeId");
      expect(stampNor("case.handed", { ...pass, toRoleHolderId: "s_other", routeId: "r_main" }, kase(), state, above)).toMatchObject({ routeId: "r_main" });
    });

    it("leaves every other event as it was", () => {
      const payload = { answer: "no", reason: "x" } as const;
      expect(stampNor("case.decided", payload, kase(), state, above)).toBe(payload);
      expect(stampNor("case.asked", { text: "?" }, kase(), state, above)).toEqual({ text: "?" });
      expect(stampNor("case.handed", { why: "no case" }, undefined, state, above)).toEqual({ why: "no case" });
    });
  });

  describe("a second look", () => {
    it("goes to the route's deputy desk, the client's seat never read", () => {
      const out = stampNor("case.appealed", { text: "Please look again, it matters", toRoleHolderId: "s_top" }, kase({ decided: noBy("u_o") }), state, above);
      expect(out.toRoleHolderId).toBe("s_dep");
      expect(appealDeskSeat(kase({ decided: noBy("u_o") }), state, above)).toEqual({ id: "s_dep", label: "Deputy" });
    });

    it("takes the seat above the deputy role when the person who said no holds that role, by user id, even with a second seat in it", () => {
      const held = kase({ decided: noBy("u_dep") });
      expect(appealDeskSeat(held, state, above)).toEqual({ id: "s_up", label: "Above" });
      // A seat of the deputy role that another person holds is not taken: the different-role rule is about the role.
      expect(stampNor("case.appealed", { text: "Please look again, it matters", toRoleHolderId: "s_dep2" }, held, state, above).toRoleHolderId).toBe("s_up");
      // Someone who holds two roles keeps both out of the way.
      const both = { ...state, seats: [...seats, { id: "s_dep_o", roleId: "role_owner", label: "Owner as well", userId: "u_dep", sort: 9 }] };
      expect(appealDeskSeat(held, both, above)).toEqual({ id: "s_up", label: "Above" });
    });

    it("takes the seat above when the route has no deputy or nobody sits there, and none when nobody is above", () => {
      expect(appealDeskSeat(kase({ routeId: "r_nodeputy", decided: noBy("u_o") }), state, above)).toEqual({ id: "s_up", label: "Above" });
      expect(appealDeskSeat(kase({ routeId: "r_emptydep", decided: noBy("u_o") }), state, above)).toEqual({ id: "s_up", label: "Above" });
      expect(appealDeskSeat(kase({ routeId: "r_gone", assigneeRoleId: "role_owner", decided: noBy("u_o") }), state, above)).toEqual({ id: "s_up", label: "Above" });
      // The no-sayer holds the role above as well: the one above that.
      const topNo = { ...state, seats: [...seats, { id: "s_up_x", roleId: "role_up", label: "Above Two", userId: "u_o", sort: 8 }] };
      expect(appealDeskSeat(kase({ routeId: "r_nodeputy", decided: noBy("u_o") }), topNo, above)).toEqual({ id: "s_top", label: "Top" });
      // Nobody is above: no seat, and a manager answers (mayAnswerAppeal).
      expect(appealDeskSeat(kase({ routeId: "r_other", assigneeRoleId: "role_other", decided: noBy("u_other") }), state, above)).toBeNull();
      const out = stampNor("case.appealed", { text: "Please look again, it matters", toRoleHolderId: "s_forged" }, kase({ routeId: "r_other", assigneeRoleId: "role_other", decided: noBy("u_other") }), state, above);
      expect(out).not.toHaveProperty("toRoleHolderId");
    });

    it("an answer and a reopen carry no seat and no date of the client's", () => {
      for (const type of ["case.appeal.decided", "case.reopened"]) {
        const out = stampNor(type, { uphold: false, reason: "A reason that is long enough to stand", why: "stopped", toRoleHolderId: "s_top", dueDay: TODAY + 99 }, kase(), state, above);
        expect(out, type).not.toHaveProperty("toRoleHolderId");
        expect(out, type).not.toHaveProperty("dueDay");
        expect(out, type).toMatchObject({ uphold: false, why: "stopped" });
      }
    });
  });
});
