// GAT-A1 (B1): the case reducer keeps the review of a raise and the cost estimate (plan GAT, D12 to D14, D18). The server stamps the seats and
// the days into the events, so each test is a fixed log of events with those fields written out. Flat top-level tests (D36).
import { expect, it } from "vitest";
import type { SeatRow } from "@/features/auth/identity";
import type { CaseEvent, CaseEventType, EventPayload } from "@/features/cases/events";
import { reduce, type ReduceSeed, type ReducedCase } from "@/features/cases/reducer";
import type { Route, SeedRole } from "@/features/demo/types";

const SEATS: SeatRow[] = [
  { id: "s_rev", roleId: "role_review", label: "R. Review", userId: "u_rev", sort: 0 },
  { id: "s_own", roleId: "role_owner", label: "T. Vogel", userId: "u_own", sort: 1 },
  { id: "s_dep", roleId: "role_deputy", label: "H. Sander", userId: "u_dep", sort: 2 },
  { id: "s_head", roleId: "role_head", label: "K. Head", userId: "u_head", sort: 3 },
];
const ROLES: SeedRole[] = [
  { id: "role_head", orgUnitId: "u", reportsToId: null },
  { id: "role_review", orgUnitId: "u", reportsToId: "role_head" },
  { id: "role_owner", orgUnitId: "u", reportsToId: "role_head" },
  { id: "role_deputy", orgUnitId: "u", reportsToId: "role_owner" },
];
const route = (id: string, ownerSeatId: string, ownerRoleId: string, name: string): Route => ({
  id, type: id, keys: [id], owner: { name, role: "Owner", dept: "PRD" }, deputy: "H. Sander", buddy: "B", wait: "2 days", ownerSeatId, ownerRoleId, deputySeatId: "s_dep", deputyRoleId: "role_deputy",
});
const SEED: ReduceSeed = { cases: [], ideas: [], problems: [], routes: [route("r1", "s_own", "role_owner", "T. Vogel"), route("r2", "s_dep", "role_deputy", "H. Sander")], promiseDays: 5, seats: SEATS, roles: ROLES };

const NAME: Record<string, string> = { u_rev: "R. Review", u_own: "T. Vogel", u_dep: "H. Sander", u_head: "K. Head", u_ra: "J. Schmidt", u_rb: "M. Roth" };
const ev = (id: string, type: CaseEventType, by: string | null, target: string, payload: EventPayload, day: number): CaseEvent =>
  ({ id, ts: 0, type, actor: by === null ? "system:clock" : NAME[by], actorUserId: by, target, payload, day });
/** A raise the server stamped as reviewed: on the review seat, with the review's due day. */
const reviewed = (id: string, by: string, day: number, reviewDueDay: number | null = day + 2, extra: EventPayload = {}) =>
  ev("raise_" + id, "case.raised", by, id, { kind: "idea", title: "Case " + id, body: "b", routeId: "r1", assignee: "R. Review", assigneeRoleHolderId: "s_rev", fromDept: "PRD", review: true, ...(reviewDueDay === null ? {} : { reviewDueDay }), ...extra }, day);
const run = (day: number, ...events: CaseEvent[]): ReducedCase[] => reduce(SEED, { events, day }).cases;
const only = (cases: ReducedCase[], id = "ca"): ReducedCase => cases.find((c) => c.id === id) as ReducedCase;

it("GAT reduce review starts a pending review on a stamped raise", () => {
  const c = only(run(1, reviewed("ca", "u_ra", 0)));
  expect(c.review).toEqual({ state: "pending", seatId: "s_rev", since: 0, dueDay: 2, forwardFrom: 2, waitsOn: null, auto: false });
  expect([c.assigneeSeatId, c.assigneeRoleId, c.assignee]).toEqual(["s_rev", "role_review", "R. Review"]); // the case sits on the review seat
  expect(c.dueDay).toBe(5); // the raiser's answer date is the promise, not the review's
  // A raise the server stamped without a due day starts it on the raise day.
  expect(only(run(1, reviewed("ca", "u_ra", 1, null))).review).toMatchObject({ state: "pending", dueDay: 1, forwardFrom: 1, since: 1 });
});

it("GAT reduce review leaves an unstamped raise without review", () => {
  const plain = ev("raise_ca", "case.raised", "u_ra", "ca", { kind: "idea", title: "Case ca", body: "b", routeId: "r1", assignee: "T. Vogel", assigneeRoleHolderId: "s_own", fromDept: "PRD" }, 0);
  expect(only(run(1, plain)).review).toBeNull();
  // A reviewDueDay without the flag, or a flag that is not true, starts nothing.
  expect(only(run(1, { ...plain, payload: { ...plain.payload, reviewDueDay: 2 } })).review).toBeNull();
  expect(only(run(1, { ...plain, payload: { ...plain.payload, review: false, reviewDueDay: 2 } })).review).toBeNull();
  // A forward on a case without a review changes nothing.
  const moved = only(run(2, plain, ev("rv", "case.reviewed", "u_rev", "ca", { outcome: "forward", routeId: "r2", toRoleHolderId: "s_dep" }, 1)));
  expect([moved.review, moved.routeId, moved.assigneeSeatId]).toEqual([null, "r1", "s_own"]);
});

it("GAT reduce review forwards to the stamped seat and keeps the answer date", () => {
  const before = only(run(1, reviewed("ca", "u_ra", 0)));
  const forwarded = only(run(1, reviewed("ca", "u_ra", 0), ev("rv", "case.reviewed", "u_rev", "ca", { outcome: "forward", routeId: "r2", toRoleHolderId: "s_dep" }, 1)));
  expect(forwarded.review).toMatchObject({ state: "forwarded", auto: false, seatId: "s_rev", dueDay: 2 });
  expect([forwarded.routeId, forwarded.assigneeSeatId, forwarded.assigneeRoleId, forwarded.assignee]).toEqual(["r2", "s_dep", "role_deputy", "H. Sander"]);
  expect(forwarded.dueDay).toBe(before.dueDay); // the raiser's answer date does not move
  // No pass and no hand-over: the ledger of passes and hand-overs is untouched.
  expect([forwarded.passes, forwarded.handed]).toEqual([0, []]);
  expect(forwarded.history.map((e) => e.type)).toEqual(["case.raised", "case.reviewed"]);
  // A second forward after the first is ignored, and so is one without a seat for an unknown route.
  const twice = only(run(2, reviewed("ca", "u_ra", 0), ev("rv", "case.reviewed", "u_rev", "ca", { outcome: "forward", routeId: "r2", toRoleHolderId: "s_dep" }, 1), ev("rv2", "case.reviewed", "u_rev", "ca", { outcome: "forward", routeId: "r1", toRoleHolderId: "s_own" }, 2)));
  expect([twice.routeId, twice.assigneeSeatId]).toEqual(["r2", "s_dep"]);
  const unknown = only(run(1, reviewed("ca", "u_ra", 0), ev("rv", "case.reviewed", "u_rev", "ca", { outcome: "forward", routeId: "r_nope", toRoleHolderId: "s_own" }, 1)));
  expect([unknown.routeId, unknown.assigneeSeatId]).toEqual(["r1", "s_own"]); // the route stays; the stamped seat is where it goes
});

it("GAT reduce review keeps the review pending through a question and its answer", () => {
  const c = only(run(3, reviewed("ca", "u_ra", 0, 3), ev("q", "case.asked", "u_rev", "ca", { text: "Which line?" }, 1), ev("a", "case.answered", "u_ra", "ca", { text: "Line 3" }, 2)));
  expect(c.status).toBe("open");
  expect(c.review).toEqual({ state: "pending", seatId: "s_rev", since: 0, dueDay: 3, forwardFrom: 3, waitsOn: null, auto: false });
  expect([c.assigneeSeatId, c.assigneeRoleId]).toEqual(["s_rev", "role_review"]); // still on the review seat
  expect(c.question?.answer?.text).toBe("Line 3");
});

it("GAT reduce review moves forwardFrom after a late answer or unanswered", () => {
  // The review is due on day 2; the answer comes on day 4: the forward may come the working day after.
  const late = only(run(5, reviewed("ca", "u_ra", 0), ev("q", "case.asked", "u_rev", "ca", { text: "Which line?" }, 1), ev("a", "case.answered", "u_ra", "ca", { text: "Line 3" }, 4)));
  expect(late.review).toMatchObject({ state: "pending", dueDay: 2, forwardFrom: 5, waitsOn: null });
  // An answer on the due day itself also waits for the next day.
  const onDue = only(run(5, reviewed("ca", "u_ra", 0), ev("q", "case.asked", "u_rev", "ca", { text: "Which line?" }, 1), ev("a", "case.answered", "u_ra", "ca", { text: "Line 3" }, 2)));
  expect(onDue.review?.forwardFrom).toBe(3);
  // The clock's case.unanswered does the same.
  const unanswered = only(run(8, reviewed("ca", "u_ra", 0), ev("q", "case.asked", "u_rev", "ca", { text: "Which line?" }, 1), ev("u", "case.unanswered", null, "ca", {}, 6)));
  expect(unanswered.status).toBe("open");
  expect(unanswered.review).toMatchObject({ state: "pending", dueDay: 2, forwardFrom: 7, waitsOn: null });
  // A person's case.unanswered is ignored: the question stays open and so does the wait.
  const ignored = only(run(8, reviewed("ca", "u_ra", 0), ev("q", "case.asked", "u_rev", "ca", { text: "Which line?" }, 1), ev("u", "case.unanswered", "u_rev", "ca", {}, 6)));
  expect([ignored.status, ignored.review?.waitsOn, ignored.review?.forwardFrom]).toEqual(["asked", "raiser", 2]);
});

it("GAT reduce review marks waiting on the raiser while asked", () => {
  const asked = only(run(2, reviewed("ca", "u_ra", 0), ev("q", "case.asked", "u_rev", "ca", { text: "Which line?" }, 1)));
  expect(asked.status).toBe("asked");
  expect(asked.review).toMatchObject({ state: "pending", waitsOn: "raiser", seatId: "s_rev" });
  expect(asked.assigneeSeatId).toBe("s_rev"); // the question does not move the case
  const answered = only(run(3, reviewed("ca", "u_ra", 0), ev("q", "case.asked", "u_rev", "ca", { text: "Which line?" }, 1), ev("a", "case.answered", "u_ra", "ca", { text: "Line 3" }, 2)));
  expect(answered.review?.waitsOn).toBeNull();
  // A question on a case without a review marks nothing.
  const plain = ev("raise_cb", "case.raised", "u_rb", "cb", { kind: "idea", title: "Case cb", body: "b", routeId: "r1", assignee: "T. Vogel", assigneeRoleHolderId: "s_own", fromDept: "PRD" }, 0);
  expect(only(run(1, plain, ev("q2", "case.asked", "u_own", "cb", { text: "Why?" }, 1)), "cb").review).toBeNull();
});

it("GAT reduce review ends the review on a no, merge, override or hand-over", () => {
  const second = reviewed("cb", "u_rb", 0);
  const state = (...events: CaseEvent[]) => run(3, reviewed("ca", "u_ra", 0), second, ...events);
  const no = only(state(ev("d", "case.decided", "u_rev", "ca", { answer: "no", category: "no-fit", reason: "It does not serve a goal of this year and it would break the gauge standard" }, 1)));
  expect(no.review).toMatchObject({ state: "ended", seatId: "s_rev" });
  const merged = state(ev("m", "case.merged", "u_rev", "ca", { into: "cb" }, 1));
  expect(only(merged).review?.state).toBe("ended");
  expect(only(merged, "cb").review?.state).toBe("pending"); // the case it was merged into is untouched
  const moved = only(state(ev("o", "case.override", "u_head", "ca", { proposed: "r1", chosen: "r2" }, 1)));
  expect(moved.review?.state).toBe("ended");
  expect([moved.routeId, moved.assigneeSeatId]).toEqual(["r2", "s_dep"]);
  const handed = only(state(ev("h", "case.handed", "u_rev", "ca", { to: "T. Vogel", toRoleHolderId: "s_own", why: "Quality owns it", routeId: "r1" }, 1)));
  expect(handed.review?.state).toBe("ended");
  expect(handed.passes).toBe(1); // a hand-over is a pass; a forward is not
  // The raiser taking the idea back ends it too.
  expect(only(state(ev("w", "case.withdrawn", "u_ra", "ca", { note: "Solved" }, 1))).review?.state).toBe("ended");
  // A question and an answer end nothing, and a forward after an end is ignored.
  const after = only(state(ev("o", "case.override", "u_head", "ca", { proposed: "r1", chosen: "r2" }, 1), ev("rv", "case.reviewed", "u_rev", "ca", { outcome: "forward", routeId: "r1", toRoleHolderId: "s_own" }, 2)));
  expect([after.review?.state, after.routeId]).toEqual(["ended", "r2"]);
});

it("GAT reduce review marks the clock forward auto", () => {
  const auto = only(run(3, reviewed("ca", "u_ra", 0), ev("rv", "case.reviewed", null, "ca", { outcome: "forward", routeId: "r1", toRoleHolderId: "s_own", auto: true }, 2)));
  expect(auto.review).toMatchObject({ state: "forwarded", auto: true });
  expect([auto.routeId, auto.assigneeSeatId, auto.assignee]).toEqual(["r1", "s_own", "T. Vogel"]);
  expect(auto.history.at(-1)?.actor).toBe("system:clock");
  // A person's forward is not auto, whatever else it says.
  const person = only(run(3, reviewed("ca", "u_ra", 0), ev("rv", "case.reviewed", "u_rev", "ca", { outcome: "forward", routeId: "r1", toRoleHolderId: "s_own" }, 2)));
  expect(person.review?.auto).toBe(false);
  // Only a forward is an outcome.
  const other = only(run(3, reviewed("ca", "u_ra", 0), ev("rv", "case.reviewed", "u_rev", "ca", { outcome: "ended", routeId: "r1", toRoleHolderId: "s_own" }, 2)));
  expect([other.review?.state, other.assigneeSeatId]).toEqual(["pending", "s_rev"]);
});

it("GAT reduce review keeps the latest cost", () => {
  const raise = reviewed("ca", "u_ra", 0);
  const cost = (id: string, by: string, day: number, payload: EventPayload) => ev(id, "case.costed", by, "ca", payload, day);
  const one = only(run(2, raise, cost("c1", "u_rev", 1, { eur: 12_000, basis: "Supplier quote" })));
  expect(one.cost).toEqual({ eur: 12_000, basis: "Supplier quote", day: 1, by: "R. Review", byUserId: "u_rev" });
  expect(only(run(3, raise, cost("c1", "u_rev", 1, { eur: 12_000, basis: "Supplier quote" }), cost("c2", "u_own", 2, { eur: 9_000, basis: "Cheaper rig" }))).cost)
    .toEqual({ eur: 9_000, basis: "Cheaper rig", day: 2, by: "T. Vogel", byUserId: "u_own" }); // the latest one counts
  // Zero is a cost; the basis is trimmed and cut to 300 characters; a number that is not a whole amount in range changes nothing.
  expect(only(run(2, raise, cost("c", "u_rev", 1, { eur: 0, basis: "  free  " }))).cost).toMatchObject({ eur: 0, basis: "free" });
  expect(only(run(2, raise, cost("c", "u_rev", 1, { eur: 5, basis: "x".repeat(400) }))).cost?.basis).toHaveLength(300);
  for (const bad of [-1, 1.5, 100_000_001]) expect(only(run(2, raise, cost("c1", "u_rev", 1, { eur: 7, basis: "ok" }), cost("c2", "u_rev", 1, { eur: bad, basis: "bad" }))).cost?.eur).toBe(7);
  // A cost does not touch the review, and a case that is gone takes none.
  expect(one.review?.state).toBe("pending");
  expect(only(run(3, raise, ev("w", "case.withdrawn", "u_ra", "ca", {}, 1), cost("c", "u_rev", 2, { eur: 5, basis: "x" }))).cost).toBeNull();
  expect(only(run(3, raise, reviewed("cb", "u_rb", 0), ev("m", "case.merged", "u_rev", "ca", { into: "cb" }, 1), cost("c", "u_rev", 2, { eur: 5, basis: "x" }))).cost).toBeNull();
  expect(only(run(1, raise)).cost).toBeNull();
});
