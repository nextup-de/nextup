// IDN-P1: the case helpers (rows, discussion, thread, feed) decide who someone is by user id and seat,
// never by a label. LOCAL_SEED has no database: its people carry the ids of features/demo/identity.ts.
import { describe, expect, it } from "vitest";
import { meFor, meOfSeat, type Me } from "@/features/auth/identity";
import type { CaseEvent, CaseEventType, EventLog, EventPayload } from "@/features/cases/events";
import { inviteSuggestions, invitedTo } from "@/features/cases/discussion";
import { supportLine } from "@/features/cases/feed";
import { reduce } from "@/features/cases/reducer";
import { cosignRow, dashboardRow } from "@/features/cases/rows";
import { deskPeople, deskThread } from "@/features/cases/thread";
import { LOCAL_SEED } from "@/features/demo";

const seats = LOCAL_SEED.seats;
const member = LOCAL_SEED.personas.find((r) => r.id === "member")!.who; // Anonymous #4471, raised c7
const memberMe = meFor(member.userId ?? null, seats);
const userOf = (label: string): string => seats.find((s) => s.label === label)!.userId!;
const meOf = (label: string): Me => meFor(userOf(label), seats);
const S0 = reduce(LOCAL_SEED, { events: [], day: 0 });

let n = 0;
const ev = (type: CaseEventType, actor: string, actorUserId: string | null, target: string | null, payload: EventPayload = {}): CaseEvent =>
  ({ id: "p" + n++, ts: 0, type, actor, actorUserId, target, payload, day: 0 });
const log = (...events: CaseEvent[]): EventLog => ({ events, day: 0 });
const raise = ev("case.raised", member.handle!, member.userId ?? null, "c_p", { title: "A cart", body: "x", routeId: "r1", assignee: "T. Vogel", fromDept: "Production, Line 3" });

describe("IDN case helpers by id", () => {
  it("a row is mine by the raiser's user id, not by a label of the same handle", () => {
    const c = S0.cases.find((x) => x.id === "c7")!;
    expect(c.fromUserId).toBe(member.userId);
    expect(dashboardRow(c, LOCAL_SEED.promiseDays, memberMe).mine).toBe(true);
    const lookalike: Me = { userId: "u_lookalike", seatIds: [], roleIds: [] }; // same handle label, another user
    expect(dashboardRow(c, LOCAL_SEED.promiseDays, lookalike).mine).toBe(false);
    expect(dashboardRow(c, LOCAL_SEED.promiseDays, { userId: null, seatIds: [], roleIds: [] }).mine).toBe(false);
  });

  it("a co-sign row finds the co-sign by user id", () => {
    const idea = S0.ideas.find((i) => i.cosigners.some((x) => x.userId !== null));
    if (!idea) return; // the local seed may carry none; the id rule is the same one asserted above
    const who = idea.cosigners.find((x) => x.userId !== null)!;
    const f = (d: number) => String(d);
    expect(cosignRow(idea, 0, f, { userId: who.userId, seatIds: [], roleIds: [] }, 3).submitted).toContain(who.name);
    expect(cosignRow(idea, 0, f, { userId: "u_other", seatIds: [], roleIds: [] }, 3).submitted).not.toContain(who.name);
  });

  it("invitedTo is true by invitedUserIds only", () => {
    const sander = userOf("H. Sander");
    const withId = reduce(LOCAL_SEED, log(raise, ev("case.discussion", "T. Vogel", userOf("T. Vogel"), "c_p", { invited: ["H. Sander"], invitedUserIds: [sander], missing: "q" }))).cases.find((c) => c.id === "c_p")!;
    expect(invitedTo(withId, meOf("H. Sander"))).toBe(true);
    expect(invitedTo(withId, meOf("M. Roth"))).toBe(false);
    // the label is there, the id is not: nobody is invited
    const labelOnly = reduce(LOCAL_SEED, log(raise, ev("case.discussion", "T. Vogel", userOf("T. Vogel"), "c_p", { invited: ["H. Sander"], missing: "q" }))).cases.find((c) => c.id === "c_p")!;
    expect(labelOnly.discussion?.invited).toEqual(["H. Sander"]);
    expect(invitedTo(labelOnly, meOf("H. Sander"))).toBe(false);
  });

  it("the invite suggestions never contain me or the raiser and are seats with a user", () => {
    const c = reduce(LOCAL_SEED, log(raise)).cases.find((x) => x.id === "c_p")!;
    const me = meOf("T. Vogel");
    const input = {
      seats, people: LOCAL_SEED.people,
      affected: [{ userId: me.userId, name: "T. Vogel" }, { userId: member.userId ?? null, name: "x" }, { userId: userOf("H. Sander"), name: "H. Sander" }],
      close: [{ fromUserId: member.userId ?? null, title: "mine" }, { fromUserId: userOf("J. Klein"), title: "Gauge" }],
      me,
    };
    const s = inviteSuggestions(c, input);
    expect(s.length).toBeGreaterThan(0);
    expect(s.map((x) => x.userId)).not.toContain(me.userId);
    expect(s.map((x) => x.userId)).not.toContain(c.fromUserId);
    expect(new Set(s.map((x) => x.userId)).size).toBe(s.length);
    expect(s.every((x) => seats.some((st) => st.userId === x.userId))).toBe(true);
    expect(s.map((x) => x.label)).toContain("H. Sander");
  });

  it("the thread lists a decider once by id and a comment counts by user id", () => {
    const vogel = userOf("T. Vogel");
    const L = log(raise,
      ev("case.asked", "T. Vogel", vogel, "c_p", { text: "?" }),
      ev("case.decided", "T. Vogel", vogel, "c_p", { answer: "no" }),
      ev("case.commented", "T. Vogel", vogel, "c_p", { text: "from the desk" }),
      ev("case.commented", "T. Vogel", "u_impostor", "c_p", { text: "same label, other user" }));
    const c = reduce(LOCAL_SEED, L).cases.find((x) => x.id === "c_p")!;
    expect(deskPeople(c, seats).filter((p) => p.userId === vogel)).toHaveLength(1);
    expect(deskPeople(c, seats).some((p) => p.userId === c.fromUserId)).toBe(false);
    const said = deskThread(c, L, seats).filter((e) => e.t === "said");
    expect(said.map((e) => e.t === "said" && e.text)).toEqual(["from the desk"]);
  });

  it("the feed's you follows the user id", () => {
    const me = meOf("T. Vogel");
    const b = (name: string, userId: string | null) => ({ name, userId });
    expect(supportLine([b("T. Vogel", me.userId)], me)).toBe("You back this");
    expect(supportLine([b("T. Vogel", "u_other")], me)).toBe("T. Vogel backs this");
    expect(supportLine([b("T. Vogel", null)], me)).toBe("T. Vogel backs this");
  });

  it("viewing as a seat is that seat's role, not a name", () => {
    const seat = seats.find((s) => s.label === "M. Roth")!;
    expect(meOfSeat(seat.id, seats).roleIds).toEqual([seat.roleId]);
  });
});
