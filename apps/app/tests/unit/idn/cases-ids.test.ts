import { describe, expect, it } from "vitest";
import { meFor, type SeatRow } from "@/features/auth/identity";
import type { CaseEvent, CaseEventType, EventPayload } from "@/features/cases/events";
import { reduce, type ReduceSeed } from "@/features/cases/reducer";
import { inboxOf, onDeskOf } from "@/features/cases/selectors";
import { LOCAL_SEED } from "@/features/demo";

const r2 = LOCAL_SEED.routes.find((r) => r.id === "r2")!;
const ownerSeat = LOCAL_SEED.seats.find((s) => s.id === r2.ownerSeatId)!;
const second: SeatRow = { id: "seat_second", roleId: ownerSeat.roleId, label: "Second Holder", userId: "u_second", sort: 999 };
const other = LOCAL_SEED.routes.find((r) => r.ownerRoleId !== ownerSeat.roleId && r.ownerSeatId)!;
const seats = [...LOCAL_SEED.seats, second];
const SEED: ReduceSeed = { ...LOCAL_SEED, seats };

let n = 0;
const ev = (type: CaseEventType, actor: string, target: string | null, payload: EventPayload = {}, over: Partial<CaseEvent> = {}, day = 0): CaseEvent =>
  ({ id: "t" + n++, ts: 0, type, actor, target, payload, day, ...over });
const raise = (extra: EventPayload = {}) => ev("case.raised", "Raiser", "c_new", { title: "x", routeId: "r2", assignee: r2.owner.name, ...extra }, { actorUserId: "u_raiser" });
const log = (events: CaseEvent[], day = 0) => ({ events, day });
const kase = (events: CaseEvent[], day = 0) => reduce(SEED, log(events, day)).cases.find((c) => c.id === "c_new")!;

describe("IDN cases on ids", () => {
  it("a raise sits on the route owner seat and role, on every holder's desk", () => {
    const S = reduce(SEED, log([raise()]));
    const c = S.cases.find((x) => x.id === "c_new")!;
    expect(c.assigneeSeatId).toBe(r2.ownerSeatId);
    expect(c.assigneeRoleId).toBe(ownerSeat.roleId);
    expect(c.fromUserId).toBe("u_raiser");
    expect(inboxOf(S, meFor("u_second", seats)).some((x) => x.id === "c_new")).toBe(true);
    expect(inboxOf(S, meFor("u_nobody", seats))).toEqual([]);
    expect(onDeskOf(c, meFor("u_nobody", seats))).toBe(false);
  });

  it("a hand-over moves seat and role; without a seat the case is on no desk", () => {
    const o = other.ownerSeatId!;
    const handed = kase([raise(), ev("case.handed", "A", "c_new", { to: "B", toRoleHolderId: o })]);
    expect(handed.assigneeSeatId).toBe(o);
    expect(handed.assigneeRoleId).toBe(other.ownerRoleId);
    const lost = kase([raise(), ev("case.handed", "A", "c_new", { to: "B" })]);
    expect(lost.assigneeSeatId).toBeNull();
    expect(lost.assigneeRoleId).toBeNull();
    expect(onDeskOf(lost, meFor(second.userId, seats))).toBe(false);
  });

  it("an override moves it to the chosen route owner seat", () => {
    const c = kase([raise(), ev("case.override", "M", "c_new", { chosen: other.id })]);
    expect(c.assigneeSeatId).toBe(other.ownerSeatId);
    expect(c.assigneeRoleId).toBe(other.ownerRoleId);
  });

  it("past the promise: the owner's case goes to the deputy role, a handed one to the owner role", () => {
    const late = LOCAL_SEED.promiseDays + 1;
    const mine = kase([raise()], late);
    expect(mine.escalated?.toRoleId).toBe(r2.deputyRoleId);
    expect(mine.escalated?.toSeatId).toBe(r2.deputySeatId);
    const away = kase([raise(), ev("case.handed", "A", "c_new", { to: "B", toRoleHolderId: other.ownerSeatId })], late);
    expect(away.escalated?.toRoleId).toBe(r2.ownerRoleId);
    expect(away.escalated?.toSeatId).toBe(r2.ownerSeatId);
  });

  it("user ids come from the events", () => {
    const S = reduce(SEED, log([
      raise(),
      ev("case.discussion", "L", "c_new", { invited: ["P"], invitedUserIds: ["u_p"] }, { actorUserId: "u_l" }),
      ev("case.invited", "L", "c_new", { invited: ["Q"], invitedUserIds: ["u_q", "u_p"] }, { actorUserId: "u_l" }),
      ev("case.decided", "L", "c_new", { answer: "no" }, { actorUserId: "u_l" }),
      ev("idea.cosigned", "Same", "i1", {}, { actorUserId: "u_a" }),
      ev("idea.cosigned", "Same", "i1", {}, { actorUserId: "u_b" }),
    ]));
    const c = S.cases.find((x) => x.id === "c_new")!;
    expect(c.decided?.byUserId).toBe("u_l");
    expect(c.discussion?.invitedUserIds).toEqual(["u_p", "u_q"]);
    expect(S.ideas.find((i) => i.id === "i1")!.cosigners.filter((x) => x.name === "Same").map((x) => x.userId)).toEqual(["u_a", "u_b"]);
  });
});
