// GAT-B1 (B1): who reviews a raise, where a raise lands when no desk is named, and which approvals a yes needs (plan GAT, D12, D16, D19), pure and
// without a database. Flat top-level tests (D36): each name is exactly what the proof's pattern says.
import { expect, it } from "vitest";
import type { SeatRow } from "@/features/auth/identity";
import { approvalsFor, costFlag, fallbackSeatFor, firstManagerSeat, reviewApplies, reviewSeatFor, triageSeat } from "@/features/approvals/rules";
import { EMPTY_APPROVAL_CONFIG, type ApprovalConfig, type ApprovalRoleInfo } from "@/features/approvals/types";

// The org: a director over a plant manager (limit 25k) over a setter lead's desk (limit 5k); quality (the review role) and its deputy sit under the plant.
const ROLES: ApprovalRoleInfo[] = [
  { id: "director", title: "Director", reportsToId: null, spendLimitEur: null },
  { id: "plant", title: "Plant manager", reportsToId: "director", spendLimitEur: 25_000 },
  { id: "desk", title: "Setter lead", reportsToId: "plant", spendLimitEur: 5_000 },
  { id: "quality", title: "Quality lead", reportsToId: "plant", spendLimitEur: null },
  { id: "qdep", title: "Quality deputy", reportsToId: "plant", spendLimitEur: null },
  { id: "finance", title: "Finance", reportsToId: "plant", spendLimitEur: null },
  { id: "triage", title: "Triage", reportsToId: "plant", spendLimitEur: null },
  { id: "fallback", title: "Fallback", reportsToId: "plant", spendLimitEur: null },
];
const seat = (id: string, roleId: string, userId: string | null, sort: number): SeatRow => ({ id, roleId, label: id, userId, sort });
const SEATS: SeatRow[] = [
  seat("s_dir", "director", "u_dir", 0), seat("s_plant", "plant", "u_plant", 1), seat("s_desk", "desk", "u_desk", 2),
  seat("s_q1", "quality", "u_q1", 3), seat("s_q2", "quality", "u_q2", 4), seat("s_dep", "qdep", "u_dep", 5), seat("s_fin", "finance", "u_fin", 6),
];
const config = (over: Partial<ApprovalConfig> = {}, review: Partial<ApprovalConfig["review"]> = {}): ApprovalConfig => ({
  ...EMPTY_APPROVAL_CONFIG, ...over, review: { ...EMPTY_APPROVAL_CONFIG.review, ...review },
});
const REVIEW = config({}, { on: true, roleId: "quality", deputyRoleId: "qdep" });
const MANAGERS = new Set(["u_plant"]);
const desk = (cfg: ApprovalConfig, seats: readonly SeatRow[] = SEATS, raiserUserId: string | null = null) => ({ config: cfg, seats, roles: ROLES, managerUserIds: MANAGERS, raiserUserId });

it("GAT rules applies review per route mode and company switch", () => {
  const cfg = config({}, { on: true, routes: { always: "always", never: "never", follow: "company" } });
  expect(reviewApplies(cfg, "always")).toBe(true);
  expect(reviewApplies(cfg, "never")).toBe(false);
  expect(reviewApplies(cfg, "follow")).toBe(true); // company: follows the switch
  expect(reviewApplies(cfg, "unlisted")).toBe(true); // a route not listed follows the switch
  expect(reviewApplies(cfg, null)).toBe(true); // a raise without a route follows the switch
  const off = config({}, { on: false, routes: { always: "always", never: "never", follow: "company" } });
  expect(reviewApplies(off, "always")).toBe(true); // always, with the switch off
  expect(reviewApplies(off, "never")).toBe(false);
  expect(reviewApplies(off, "follow")).toBe(false);
  expect(reviewApplies(off, "unlisted")).toBe(false);
  expect(reviewApplies(off, null)).toBe(false);
});

it("GAT rules never places a raise on a seat the raiser holds", () => {
  const pick = (raiserUserId: string | null, seats: readonly SeatRow[] = SEATS) => reviewSeatFor({ config: REVIEW, seats, roles: ROLES, raiserUserId })?.id ?? null;
  expect(pick("u_other")).toBe("s_q1"); // the first seat of the review role
  expect(pick(null)).toBe("s_q1");
  expect(pick("u_q1")).toBe("s_q2"); // own idea: the role's other seat
  expect(pick("u_q2")).toBe("s_q1");
  // The raiser holds both quality seats: the deputy role's seat.
  const both = SEATS.map((s) => (s.id === "s_q2" ? { ...s, userId: "u_q1" } : s));
  expect(pick("u_q1", both)).toBe("s_dep");
  // And an empty quality seat is no seat.
  expect(pick("u_other", SEATS.map((s) => (s.roleId === "quality" ? { ...s, userId: null } : s)))).toBe("s_dep");
  // Whichever seat comes back, the raiser is not on it.
  for (const raiser of ["u_q1", "u_q2", "u_dep", "u_plant", "u_other"]) {
    const found = reviewSeatFor({ config: REVIEW, seats: SEATS, roles: ROLES, raiserUserId: raiser });
    expect(found?.userId).not.toBe(raiser);
  }
});

it("GAT rules falls back to the deputy role and the role above", () => {
  const seatsWith = (...held: [string, string | null][]): SeatRow[] => SEATS.map((s) => { const set = held.find(([id]) => id === s.id); return set ? { ...s, userId: set[1] } : s; });
  const pick = (raiser: string, seats: readonly SeatRow[], cfg: ApprovalConfig = REVIEW) => reviewSeatFor({ config: cfg, seats, roles: ROLES, raiserUserId: raiser })?.id ?? null;
  // Every quality seat and the deputy's seat are held by the raiser: the role the review role reports to.
  const mine = seatsWith(["s_q1", "u_me"], ["s_q2", "u_me"], ["s_dep", "u_me"]);
  expect(pick("u_me", mine)).toBe("s_plant");
  // The raiser holds the plant seat too: no review at all.
  expect(pick("u_me", seatsWith(["s_q1", "u_me"], ["s_q2", "u_me"], ["s_dep", "u_me"], ["s_plant", "u_me"]))).toBeNull();
  // No deputy role named: straight to the role above.
  expect(pick("u_me", seatsWith(["s_q1", "u_me"], ["s_q2", "u_me"]), config({}, { on: true, roleId: "quality" }))).toBe("s_plant");
  // No review role named: nothing to place.
  expect(pick("u_other", SEATS, config({}, { on: true }))).toBeNull();
  // A role with nobody on it is skipped.
  expect(pick("u_other", seatsWith(["s_q1", null], ["s_q2", null], ["s_dep", null]))).toBe("s_plant");
});

it("GAT rules picks triage and fallback seats in D16s order", () => {
  const triage = (cfg: ApprovalConfig, seats: readonly SeatRow[] = SEATS, raiser: string | null = null) => triageSeat(desk(cfg, seats, raiser))?.id ?? null;
  const fallback = (cfg: ApprovalConfig, seats: readonly SeatRow[] = SEATS, raiser: string | null = null) => fallbackSeatFor(desk(cfg, seats, raiser))?.id ?? null;
  const withTriage = [...SEATS, seat("s_tri", "triage", "u_tri", 7), seat("s_fb", "fallback", "u_fb", 8)];
  const named = config({ triageRoleId: "triage", fallbackRoleId: "fallback" }, { on: false, roleId: "quality" });
  // Review on: the review seat for both, whatever the roles named.
  const on = config({ triageRoleId: "triage", fallbackRoleId: "fallback" }, { on: true, roleId: "quality", deputyRoleId: "qdep" });
  expect(triage(on, withTriage)).toBe("s_q1");
  expect(fallback(on, withTriage)).toBe("s_q1");
  expect(triage(on, withTriage, "u_q1")).toBe("s_q2"); // never the raiser's own seat
  // Review off: the role each setting names.
  expect(triage(named, withTriage)).toBe("s_tri");
  expect(fallback(named, withTriage)).toBe("s_fb");
  // No such role set, or nobody on it: the first manager role's seat.
  expect(triage(config(), withTriage)).toBe("s_plant");
  expect(fallback(config({ fallbackRoleId: "fallback" }), SEATS)).toBe("s_plant");
  // Review on but no review seat at all: the settings still apply.
  const noReview = config({ triageRoleId: "triage" }, { on: true, roleId: "nobody-here" });
  expect(triage(noReview, withTriage)).toBe("s_tri");
  // No manager either: today's head of the org chart (the director's seat).
  expect(triageSeat({ ...desk(config()), managerUserIds: new Set() })?.id).toBe("s_dir");
  expect(fallbackSeatFor({ ...desk(config()), managerUserIds: new Set() })?.id).toBe("s_dir");
  // No seat at all: nowhere to go.
  expect(triage(config(), [])).toBeNull();
});

it("GAT rules finds the first manager role seat", () => {
  expect(firstManagerSeat({ seats: SEATS, managerUserIds: new Set(["u_plant", "u_dir"]) })?.id).toBe("s_dir"); // by sort, not by the set's order
  expect(firstManagerSeat({ seats: SEATS, managerUserIds: new Set(["u_plant"]) })?.id).toBe("s_plant");
  expect(firstManagerSeat({ seats: [...SEATS].reverse(), managerUserIds: new Set(["u_q2", "u_q1"]) })?.id).toBe("s_q1");
  expect(firstManagerSeat({ seats: SEATS, managerUserIds: new Set(["nobody"]) })).toBeNull();
  expect(firstManagerSeat({ seats: SEATS.map((s) => ({ ...s, userId: null })), managerUserIds: new Set(["u_plant"]) })).toBeNull();
});

const RULES = config({
  rules: [
    { id: "ru1", kind: "role", roleId: "finance", routeKey: null, minEur: 10_000 },
    { id: "ru2", kind: "council", councilId: "k1", routeKey: "r1", minEur: null },
    { id: "ru3", kind: "role", roleId: "quality", routeKey: "r2", minEur: null },
  ],
  councils: [{ id: "k1", name: "Investment council", memberRoleIds: ["plant", "finance"], secretaryRoleId: "finance", everyDays: 10, firstDay: 20 }],
});
const steps = (over: Partial<Parameters<typeof approvalsFor>[0]> = {}) =>
  approvalsFor({ config: RULES, roles: ROLES, fastLaneEur: 5_000, decidingRoleId: "desk", routeKey: "r1", costEur: 12_000, byHand: [], ...over });

it("GAT rules orders budget council and role steps", () => {
  // A 12k idea on a 5k desk under a 25k plant manager: budget (plant covers up to 25k), the council of r1, the finance role rule, then a role by hand.
  expect(steps({ byHand: ["qdep"] })).toEqual([
    { kind: "budget", roleId: "plant", coversUpToEur: 25_000 },
    { kind: "council", councilId: "k1" },
    { kind: "role", roleId: "finance" },
    { kind: "role", roleId: "qdep", byHand: true },
  ]);
  // The rule for another route is not asked; a rule above the cost is not asked.
  expect(steps({ routeKey: "r2", costEur: 8_000 })).toEqual([{ kind: "budget", roleId: "plant", coversUpToEur: 25_000 }, { kind: "role", roleId: "quality" }]);
  // A cost above the plant manager's limit goes to the top of the chain, for any cost.
  expect(steps({ costEur: 60_000 })[0]).toEqual({ kind: "budget", roleId: "director", coversUpToEur: null });
  // A cost the desk may spend and the fast lane allows needs no budget step.
  expect(steps({ costEur: 4_000, routeKey: "none" })).toEqual([]);
  // The cost flag: above the fast lane only.
  expect([costFlag(5_000, 5_000), costFlag(5_001, 5_000), costFlag(null, 5_000), costFlag(undefined, 5_000)]).toEqual([false, true, false, false]);
});

it("GAT rules skips the deciding role, duplicates and unknown roles", () => {
  // The deciding role is never asked, by rule or by hand.
  const own = config({ rules: [{ id: "x", kind: "role", roleId: "desk", routeKey: null, minEur: null }] });
  expect(steps({ config: own, costEur: null, byHand: ["desk"] })).toEqual([]);
  // The same role twice (a rule and a hand-added role, or the budget approver and a rule) is kept once at its first place.
  const dup = config({ rules: [{ id: "a", kind: "role", roleId: "finance", routeKey: null, minEur: null }, { id: "b", kind: "role", roleId: "finance", routeKey: null, minEur: null }] });
  expect(steps({ config: dup, costEur: null, byHand: ["finance", "qdep", "qdep"] })).toEqual([{ kind: "role", roleId: "finance" }, { kind: "role", roleId: "qdep", byHand: true }]);
  const budgetDup = config({ rules: [{ id: "p", kind: "role", roleId: "plant", routeKey: null, minEur: null }] });
  expect(steps({ config: budgetDup, byHand: ["plant"] })).toEqual([{ kind: "budget", roleId: "plant", coversUpToEur: 25_000 }]);
  // The same council twice is one step.
  const twice = config({ ...RULES, rules: [{ id: "a", kind: "council", councilId: "k1", routeKey: null, minEur: null }, { id: "b", kind: "council", councilId: "k1", routeKey: "r1", minEur: null }] });
  expect(steps({ config: twice, costEur: null }).filter((s) => s.kind === "council")).toHaveLength(1);
  // A rule, or a hand-added role, naming a role or council that is gone is skipped.
  const gone = config({ rules: [{ id: "g", kind: "role", roleId: "deleted", routeKey: null, minEur: null }, { id: "h", kind: "council", councilId: "deleted", routeKey: null, minEur: null }] });
  expect(steps({ config: gone, costEur: null, byHand: ["deleted"] })).toEqual([]);
});

it("GAT rules gives no budget step without a cost", () => {
  expect(steps({ costEur: null }).some((s) => s.kind === "budget")).toBe(false);
  // The rules with a minimum cost need one too; the ones without apply.
  expect(steps({ costEur: null }).map((s) => s.kind)).toEqual(["council"]);
  // A cost of zero is a cost, and is not above the fast lane.
  expect(steps({ costEur: 0 }).some((s) => s.kind === "budget")).toBe(false);
  // The top of the chain has nobody above: no budget step for it either.
  expect(steps({ decidingRoleId: "director", costEur: 90_000 }).some((s) => s.kind === "budget")).toBe(false);
  // A deciding role the org does not know has no chain.
  expect(steps({ decidingRoleId: "ghost", costEur: 90_000 }).some((s) => s.kind === "budget")).toBe(false);
});
