// GAT-R1 (B1): where the server places a raise (plan GAT, D12, D16, D17): on the review seat the raiser does not hold, the triage seat, the
// fallback seat or the route's owner, and where a desk's second look goes. Fixed seeds; the pure stamp only.
import { expect, it } from "vitest";
import { EMPTY_APPROVAL_CONFIG, type ApprovalConfig } from "@/features/approvals/types";
import type { SeatRow } from "@/features/auth/identity";
import type { ReducedCase } from "@/features/cases/reducer";
import { stampEvent, stampNor, type StampSeed } from "@/features/cases/stamp";
import type { Route, SeedRole } from "@/features/demo/types";

const seat = (id: string, roleId: string, label: string, userId: string | null, sort: number): SeatRow => ({ id, roleId, label, userId, sort });
const SEATS: SeatRow[] = [
  seat("s_head", "role_head", "K. Head", "u_head", 0), // the manager at the top
  seat("s_rev1", "role_review", "R. Review One", "u_rev1", 1),
  seat("s_rev2", "role_review", "R. Review Two", "u_rev2", 2),
  seat("s_dep", "role_deputy", "D. Deputy", "u_dep", 3),
  seat("s_own", "role_owner", "T. Owner", "u_own", 4),
  seat("s_tri", "role_triage", "T. Triage", "u_tri", 5),
  seat("s_fb", "role_fallback", "F. Fallback", "u_fb", 6),
  seat("s_op", "role_op", "O. Operator", "u_ra", 7),
];
const ROLES: SeedRole[] = [
  { id: "role_head", orgUnitId: "u", reportsToId: null, title: "Plant manager" },
  { id: "role_review", orgUnitId: "u", reportsToId: "role_head", title: "Review" },
  { id: "role_deputy", orgUnitId: "u", reportsToId: "role_review", title: "Deputy" },
  { id: "role_owner", orgUnitId: "u", reportsToId: "role_review", title: "Owner" },
  { id: "role_triage", orgUnitId: "u", reportsToId: "role_head", title: "Triage" },
  { id: "role_fallback", orgUnitId: "u", reportsToId: "role_head", title: "Fallback" },
  { id: "role_op", orgUnitId: "u", reportsToId: "role_owner", title: "Operator" },
];
const route = (id: string, ownerSeatId: string | null): Route => ({
  id, type: "Type " + id, keys: [id], owner: { name: "T. Owner", role: "Owner", dept: "OPS" }, deputy: "D. Deputy", buddy: "B", wait: "2 days",
  ownerSeatId, ownerRoleId: ownerSeatId === null ? null : "role_owner", deputySeatId: "s_dep", deputyRoleId: "role_deputy",
});
const ROUTES: Route[] = [route("r1", "s_own"), route("r_free", "s_own"), route("r_none", null)];

const config = (over: Partial<ApprovalConfig> = {}, review: Partial<ApprovalConfig["review"]> = {}): ApprovalConfig => ({
  ...EMPTY_APPROVAL_CONFIG, ...over, review: { ...EMPTY_APPROVAL_CONFIG.review, on: true, roleId: "role_review", deputyRoleId: "role_deputy", ...review },
});
const seed = (approvals: ApprovalConfig | undefined, over: Partial<StampSeed> = {}): StampSeed => ({
  routes: ROUTES, seats: SEATS, roles: ROLES, approvals, managerUserIds: ["u_head"], ...over,
});
const raise = (routeId: string | null, extra: Record<string, unknown> = {}) => ({ title: "T", body: "b", routeId, assignee: "client", assigneeRoleHolderId: "s_client", ...extra });
const stamp = (s: StampSeed, routeId: string | null, ctx: { raiserUserId?: string | null; today?: number } = { raiserUserId: "u_ra", today: 10 }, extra: Record<string, unknown> = {}) =>
  stampEvent("case.raised", raise(routeId, extra), s, ctx);

it("GAT stamp places a reviewed raise on the review seat", () => {
  const out = stamp(seed(config()), "r1");
  expect(out).toMatchObject({ assigneeRoleHolderId: "s_rev1", assignee: "R. Review One", review: true, reviewDueDay: 12, routeId: "r1" });
  // the review's days count: 3 working days
  expect(stamp(seed(config({}, { days: 3 })), "r1", { raiserUserId: "u_ra", today: 20 })).toMatchObject({ review: true, reviewDueDay: 23 });
  // a raise without a route follows the company switch; a route that says always is reviewed with the switch off
  expect(stamp(seed(config()), null)).toMatchObject({ assigneeRoleHolderId: "s_rev1", review: true });
  expect(stamp(seed(config({}, { on: false, routes: { r1: "always" } })), "r1")).toMatchObject({ assigneeRoleHolderId: "s_rev1", review: true });
  // what the client sent about the review is the server's call: dropped when the raise is not reviewed
  const plain = stamp(seed(undefined), "r1", undefined, { review: true, reviewDueDay: 99 });
  expect(plain).toMatchObject({ assigneeRoleHolderId: "s_own" });
  expect(plain).not.toHaveProperty("review");
  expect(plain).not.toHaveProperty("reviewDueDay");
  // without today the clock of the seed names the day (a seed without a calendar: day 0)
  expect(stamp(seed(config()), "r1", { raiserUserId: "u_ra" })).toMatchObject({ review: true, reviewDueDay: 2 });
});

it("GAT stamp skips a review seat the raiser holds", () => {
  // the first review seat is the raiser's: the next one reviews
  expect(stamp(seed(config()), "r1", { raiserUserId: "u_rev1", today: 10 })).toMatchObject({ assigneeRoleHolderId: "s_rev2", review: true });
  // every review seat is the raiser's: the deputy role's first seat
  const raiserHoldsAll = SEATS.map((s) => (s.roleId === "role_review" ? { ...s, userId: "u_rev1" } : s));
  expect(stamp(seed(config(), { seats: raiserHoldsAll }), "r1", { raiserUserId: "u_rev1", today: 10 })).toMatchObject({ assigneeRoleHolderId: "s_dep", review: true });
  // the role above holds the raise when the review roles are the raiser's
  const noDeputy = config({}, { deputyRoleId: null });
  expect(stamp(seed(noDeputy, { seats: raiserHoldsAll }), "r1", { raiserUserId: "u_rev1", today: 10 })).toMatchObject({ assigneeRoleHolderId: "s_head", review: true });
  // nobody else can review it: it is not reviewed and goes to its owner
  const onlyRaiser = SEATS.filter((s) => !["role_review", "role_deputy", "role_head"].includes(s.roleId)).concat(seat("s_r", "role_review", "R", "u_rev1", 1));
  const out = stamp(seed(noDeputy, { seats: onlyRaiser }), "r1", { raiserUserId: "u_rev1", today: 10 });
  expect(out).toMatchObject({ assigneeRoleHolderId: "s_own" });
  expect(out).not.toHaveProperty("review");
});

it("GAT stamp places a route-less raise on the triage seat", () => {
  // review off: the seat the Triage setting names
  expect(stamp(seed(config({ triageRoleId: "role_triage" }, { on: false })), null)).toMatchObject({ assigneeRoleHolderId: "s_tri", assignee: "T. Triage" });
  // an unknown route is no route
  expect(stamp(seed(config({ triageRoleId: "role_triage" }, { on: false })), "r_unknown")).toMatchObject({ assigneeRoleHolderId: "s_tri" });
  // review on and no seat free for it: still the review seat when one is
  expect(stamp(seed(config({ triageRoleId: "role_triage" })), null)).toMatchObject({ assigneeRoleHolderId: "s_rev1", review: true });
});

it("GAT stamp places a raise onto an ownerless route on the fallback seat", () => {
  expect(stamp(seed(config({ fallbackRoleId: "role_fallback" }, { on: false })), "r_none")).toMatchObject({ assigneeRoleHolderId: "s_fb", assignee: "F. Fallback" });
  // the triage setting does not move it
  expect(stamp(seed(config({ triageRoleId: "role_triage", fallbackRoleId: "role_fallback" }, { on: false })), "r_none")).toMatchObject({ assigneeRoleHolderId: "s_fb" });
});

it("GAT stamp uses the first manager role seat when nothing is set", () => {
  const none = seed(config({}, { on: false }));
  // the first seat held by a manager is the head: its role's first occupied seat
  expect(stamp(none, null)).toMatchObject({ assigneeRoleHolderId: "s_head", assignee: "K. Head" });
  expect(stamp(none, "r_none")).toMatchObject({ assigneeRoleHolderId: "s_head" });
  // the manager is on another role: that role's first seat
  expect(stamp(seed(config({}, { on: false }), { managerUserIds: ["u_tri"] }), null)).toMatchObject({ assigneeRoleHolderId: "s_tri" });
  // no managers: the head of the org chart, as before
  expect(stamp(seed(config({}, { on: false }), { managerUserIds: [] }), null)).toMatchObject({ assigneeRoleHolderId: "s_head" });
  // the old three-argument call, with no settings at all, still lands on the head
  expect(stampEvent("case.raised", raise(null), { routes: ROUTES, seats: SEATS, roles: ROLES })).toMatchObject({ assigneeRoleHolderId: "s_head" });
});

it("GAT stamp keeps a never-review route on its owner", () => {
  const never = seed(config({}, { routes: { r1: "never" } }));
  const out = stamp(never, "r1");
  expect(out).toMatchObject({ assigneeRoleHolderId: "s_own" });
  expect(out).not.toHaveProperty("review");
  // another route of the same company is reviewed
  expect(stamp(never, "r_free")).toMatchObject({ assigneeRoleHolderId: "s_rev1", review: true });
  // every other type passes unchanged
  const handed = { to: "x", toRoleHolderId: "s_x" };
  expect(stampEvent("case.handed", handed, never)).toBe(handed);
});

it("GAT stamp sends a desks second look to the review seat", () => {
  const state = (approvals: ApprovalConfig) => ({
    seats: SEATS, routes: ROUTES, day: 10, approvals: { ...approvals, roles: ROLES.map((r) => ({ id: r.id, title: r.title ?? "", reportsToId: r.reportsToId, spendLimitEur: null })) },
  });
  const noBy = (userId: string) => ({
    id: "c1", fromUserId: "u_ra", routeId: "r1", assigneeRoleId: "role_owner",
    decided: { answer: "no", reason: "A reason that is long enough to count", note: "", by: "x", byUserId: userId, day: 3 },
  }) as unknown as ReducedCase;
  const above = () => null;
  const appeal = { text: "Please look again, the numbers changed", toRoleHolderId: "s_client" };
  // review applies: the desk's no goes to the review seat, not the route's deputy; the client's seat is never read
  expect(stampNor("case.appealed", appeal, noBy("u_own"), state(config()), above)).toMatchObject({ toRoleHolderId: "s_rev1" });
  // the raiser holds the first review seat: the next one
  const mine = { ...noBy("u_own"), fromUserId: "u_rev1" } as ReducedCase;
  expect(stampNor("case.appealed", appeal, mine, state(config()), above)).toMatchObject({ toRoleHolderId: "s_rev2" });
  // the person who said no holds the review role: NOR's rule, the route's deputy
  expect(stampNor("case.appealed", appeal, noBy("u_rev1"), state(config()), above)).toMatchObject({ toRoleHolderId: "s_dep" });
  // review does not apply (never): NOR's rule
  expect(stampNor("case.appealed", appeal, noBy("u_own"), state(config({}, { routes: { r1: "never" } })), above)).toMatchObject({ toRoleHolderId: "s_dep" });
  // no settings in the state at all (a caller of the old shape): NOR's rule
  expect(stampNor("case.appealed", appeal, noBy("u_own"), { seats: SEATS, routes: ROUTES, day: 10 }, above)).toMatchObject({ toRoleHolderId: "s_dep" });
});
