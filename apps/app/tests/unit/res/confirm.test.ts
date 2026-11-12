// RES-B1 (B2): who may confirm a typed result and who is told that it waits, with the accepted sponsor (D15) and the result a manager
// alone confirms (D14). Literal values only: no reducer, no state.
import { describe, expect, it } from "vitest";
import { meFor, type SeatRow } from "@/features/auth/identity";
import { confirmerIds, mayConfirm, unconfirmedOf, type Unconfirmed } from "@/features/projects/confirm";
import type { Measure, ReducedProject } from "@/features/projects/types";

const seats: SeatRow[] = [
  { id: "seat_dep", roleId: "role_deputy", label: "H. Sander", userId: "u_dep", sort: 0 },
  { id: "seat_head", roleId: "role_head", label: "K. Head", userId: "u_head", sort: 1 },
];
const project = (over: Partial<Pick<ReducedProject, "leadUserId" | "sponsorUserId">> = {}) => ({ leadUserId: "u_lead", sponsorUserId: "u_sp", ...over });
const measure = (over: Partial<Measure> = {}) => ({ check: 30, day: 31, byUserId: "u_typ", sourceKind: "typed", confirmed: false, sentBack: false, managerOnly: false, ...over }) as Measure;
const waiting = (m: Measure = measure(), upSeatId: string | null = null): Unconfirmed => ({ check: m.check, measure: m, dueDay: m.day + 5, upSeatId });
const who = (userId: string | null, manager = false) => ({ userId, manager, me: userId === null ? undefined : meFor(userId, seats) });
const may = (p: ReturnType<typeof project>, u: Unconfirmed, userId: string | null, manager = false) => mayConfirm(p, u, who(userId, manager), "role_deputy", seats);

describe("RES confirm", () => {
  it("the accepted sponsor may confirm, like the deputy and a manager", () => {
    for (const [userId, manager] of [["u_sp", false], ["u_dep", false], ["u_mgr", true]] as const) expect(may(project(), waiting(), userId, manager), userId).toBe(true);
    for (const userId of ["u_x", "u_head", null]) expect(may(project(), waiting(), userId), String(userId)).toBe(false);
  });

  it("never the lead or who typed it, whatever role they hold now", () => {
    expect(may(project(), waiting(), "u_lead")).toBe(false);
    expect(may(project(), waiting(), "u_typ")).toBe(false);
    // The typist became the sponsor, or the deputy; a manager typed it: by user id, none of them is a second person.
    expect(may(project({ sponsorUserId: "u_typ" }), waiting(), "u_typ")).toBe(false);
    expect(may(project(), waiting(measure({ byUserId: "u_dep" })), "u_dep")).toBe(false);
    expect(may(project(), waiting(measure({ byUserId: "u_mgr" })), "u_mgr", true)).toBe(false);
    // A sponsor who also leads the project is the lead.
    expect(may(project({ sponsorUserId: "u_lead" }), waiting(), "u_lead")).toBe(false);
  });

  it("a project without a sponsor is confirmed as before", () => {
    const p = project({ sponsorUserId: null });
    expect(may(p, waiting(), "u_dep")).toBe(true);
    expect(may(p, waiting(), "u_sp")).toBe(false);
    expect(may(p, waiting(), "u_mgr", true)).toBe(true);
  });

  it("the seat the clock passed it up to still may", () => {
    expect(may(project(), waiting(measure(), "seat_head"), "u_head")).toBe(true);
    expect(may(project(), waiting(), "u_head")).toBe(false);
  });

  it("a result questioned twice may be confirmed by managers only", () => {
    const only = waiting(measure({ managerOnly: true }), "seat_head");
    expect(may(project(), only, "u_mgr", true)).toBe(true);
    for (const userId of ["u_sp", "u_dep", "u_head"]) expect(may(project(), only, userId), userId).toBe(false);
    // Not even a manager who typed it or leads it.
    expect(may(project(), only, "u_typ", true)).toBe(false);
    expect(may(project(), only, "u_lead", true)).toBe(false);
  });

  it("confirmerIds at the desk adds the sponsor to the managers and the deputy's holders, without the lead and the typist", () => {
    expect(confirmerIds(project(), waiting(), "role_deputy", seats, ["u_mgr"], "desk").sort()).toEqual(["u_dep", "u_mgr", "u_sp"]);
    expect(confirmerIds(project({ sponsorUserId: null }), waiting(), "role_deputy", seats, ["u_mgr"], "desk").sort()).toEqual(["u_dep", "u_mgr"]);
    expect(confirmerIds(project({ sponsorUserId: "u_typ" }), waiting(), "role_deputy", seats, ["u_mgr", "u_lead", "u_typ"], "desk").sort()).toEqual(["u_dep", "u_mgr"]);
    expect(confirmerIds(project({ sponsorUserId: "u_dep" }), waiting(), "role_deputy", seats, ["u_dep"], "desk")).toEqual(["u_dep"]);
  });

  it("confirmerIds above lists the seat the clock passed it up to, not the sponsor", () => {
    expect(confirmerIds(project(), waiting(measure(), "seat_head"), "role_deputy", seats, ["u_mgr"], "above")).toEqual(["u_head"]);
  });

  it("confirmerIds for a result questioned twice lists only the managers, at either level", () => {
    const only = waiting(measure({ managerOnly: true }), "seat_head");
    for (const level of ["desk", "above"] as const) expect(confirmerIds(project(), only, "role_deputy", seats, ["u_mgr", "u_typ", "u_lead"], level), level).toEqual(["u_mgr"]);
  });

  it("a sent-back result waits for the lead, not for a confirmer", () => {
    const p = { measures: [measure(), measure({ check: 90, sentBack: true })], stopped: null, history: [] };
    expect(unconfirmedOf(p).map((u) => u.check)).toEqual([30]);
    expect(unconfirmedOf({ ...p, measures: [measure({ sentBack: true })] })).toEqual([]);
  });
});
