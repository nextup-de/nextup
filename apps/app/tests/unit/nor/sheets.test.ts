// NOR-S1: what the desk's sheets show and send (plan NOR, D13, D14, D17, D19, D20). Pure: no React, no clock.
import { describe, expect, it } from "vitest";
import type { SeatRow } from "@/features/auth/identity";
import type { CaseEvent } from "@/features/cases/events";
import { NO_CATEGORIES } from "@/features/cases/no";
import type { ReducedCase } from "@/features/cases/reducer";
import { askSheet, checkinSheet, dayOfDate, noSheet, passSheet, seatAboveRole, type NoInput } from "@/features/cases/sheets";
import { DEFAULT_CALENDAR } from "@/features/clock";
import { dateOfWorkday, workdayOf } from "@/features/clock/calendar";
import type { Route } from "@/features/demo/types";

const RULES = { noReasonMin: 40 };
const REASON = "The budget for this year is already spent on the new line, sorry.";
const TODAY = 400;
const base = { id: "c_a", notNowInRow: 0 };
const input = (over: NoInput = {}): NoInput => ({ category: "no-fit", reason: REASON, ...over });

describe("NOR no sheet", () => {
  it("offers the six categories, and hides Not now after two in a row", () => {
    expect(noSheet(base, RULES, TODAY).categories.map((c) => c.id)).toEqual([...NO_CATEGORIES]);
    expect(noSheet(base, RULES, TODAY).categories.filter((c) => c.hidden)).toEqual([]);
    expect(noSheet({ ...base, notNowInRow: 1 }, RULES, TODAY).categories.some((c) => c.hidden)).toBe(false);
    const used = noSheet({ ...base, notNowInRow: 2 }, RULES, TODAY);
    expect(used.categories.filter((c) => c.hidden).map((c) => c.id)).toEqual(["not-now"]);
    // A picked Not now that is used up is no pick, whatever was sent.
    expect(noSheet({ ...base, notNowInRow: 2 }, RULES, TODAY, input({ category: "not-now", revisitDay: TODAY + 5 })).problems).toContain("category");
  });

  it("says which fields each category needs: a date for Not now (needed) and No budget (optional), a link for Already solved or in work", () => {
    const need = Object.fromEntries(noSheet(base, RULES, TODAY).categories.map((c) => [c.id, [c.date, c.needsRef]]));
    expect(need).toEqual({
      "not-now": ["required", false], "no-budget": ["optional", false], "no-fit": ["none", false],
      duplicate: ["none", true], risk: ["none", false], "not-feasible": ["none", false],
    });
  });

  it("requires a category and a reason of noReasonMin characters, as the company sets it", () => {
    expect(noSheet(base, RULES, TODAY).problems).toEqual(["category", "reason"]);
    expect(noSheet(base, RULES, TODAY, input({ reason: "x".repeat(39) })).problems).toEqual(["reason"]);
    expect(noSheet(base, RULES, TODAY, input({ reason: "x".repeat(40) })).ok).toBe(true);
    // The company's rule counts, and spaces around the reason do not.
    expect(noSheet(base, { noReasonMin: 120 }, TODAY, input({ reason: REASON })).problems).toEqual(["reason"]);
    expect(noSheet(base, { noReasonMin: 20 }, TODAY, input({ reason: "  " + "x".repeat(19) + "  " })).problems).toEqual(["reason"]);
    expect(noSheet(base, RULES, TODAY, input({ reason: "x".repeat(2001) })).problems).toContain("reasonLong");
    expect(noSheet(base, RULES, TODAY, input({ changeIf: "y".repeat(401) })).problems).toEqual(["changeIf"]);
  });

  it("requires a revisit date for Not now, after today and at most 250 working days ahead", () => {
    const notNow = (revisitDay?: number | null) => noSheet(base, RULES, TODAY, input({ category: "not-now", revisitDay }));
    expect(notNow().problems).toEqual(["revisit"]);
    expect(notNow(TODAY).problems).toEqual(["revisit"]);
    expect(notNow(TODAY - 3).problems).toEqual(["revisit"]);
    expect(notNow(TODAY + 251).problems).toEqual(["revisit"]);
    expect(notNow(Number.NaN).problems).toEqual(["revisit"]);
    expect(notNow(TODAY + 1).ok).toBe(true);
    expect(notNow(TODAY + 250).ok).toBe(true);
  });

  it("takes a date for No budget but does not need one, and refuses one on a category that cannot come back", () => {
    expect(noSheet(base, RULES, TODAY, input({ category: "no-budget" })).ok).toBe(true);
    expect(noSheet(base, RULES, TODAY, input({ category: "no-budget", revisitDay: TODAY + 20 })).ok).toBe(true);
    expect(noSheet(base, RULES, TODAY, input({ category: "no-budget", revisitDay: TODAY })).problems).toEqual(["revisit"]);
    expect(noSheet(base, RULES, TODAY, input({ category: "risk", revisitDay: TODAY + 5 })).problems).toEqual(["revisitUnneeded"]);
  });

  it("requires a case or project that is visible and is not this case for Already solved or in work", () => {
    const dup = (duplicateOf?: string | null, refs: string[] = ["c_other", "p_one"]) => noSheet(base, RULES, TODAY, input({ category: "duplicate", duplicateOf }), refs);
    expect(dup().problems).toEqual(["ref"]);
    expect(dup("c_a", ["c_a", "c_other"]).problems).toEqual(["ref"]); // never the case itself
    expect(dup("c_unknown").problems).toEqual(["ref"]);
    expect(dup("c_other").ok).toBe(true);
    expect(dup("p_one").ok).toBe(true);
  });

  it("builds the NOR no payload: category, reason, and only the optional fields that were given", () => {
    expect(noSheet(base, RULES, TODAY, input({ category: "not-feasible", reason: `  ${REASON}  ` })).payload()).toEqual({ answer: "no", category: "not-feasible", reason: REASON });
    expect(noSheet(base, RULES, TODAY, input({ category: "not-now", changeIf: " A quote under 5000 ", revisitDay: TODAY + 20 })).payload())
      .toEqual({ answer: "no", category: "not-now", reason: REASON, changeIf: "A quote under 5000", revisitDay: TODAY + 20 });
    expect(noSheet(base, RULES, TODAY, input({ category: "duplicate", duplicateOf: "c_other" }), ["c_other"]).payload())
      .toEqual({ answer: "no", category: "duplicate", reason: REASON, duplicateOf: "c_other" });
    // Nothing is sent that the sheet would not accept.
    expect(noSheet(base, RULES, TODAY, input({ reason: "short" })).payload()).toBeNull();
    // A date typed before another category was picked is not carried along.
    expect(noSheet(base, RULES, TODAY, input({ category: "no-fit", revisitDay: null })).payload()).not.toHaveProperty("revisitDay");
  });

  it("turns the date field's value into a working-day number: a working day of the calendar, never a holiday moved to another day", () => {
    const clock = { mode: "workdays", calendar: DEFAULT_CALENDAR } as const;
    const today = new Date("2026-11-12T10:00:00Z");
    const day = workdayOf(today, DEFAULT_CALENDAR);
    expect(dayOfDate("2026-11-16", clock, today, day)).toBe(workdayOf(new Date("2026-11-16T12:00:00Z"), DEFAULT_CALENDAR));
    expect(dayOfDate(dateOfWorkday(day + 5, DEFAULT_CALENDAR), clock, today, day)).toBe(day + 5);
    expect(dayOfDate("2026-11-14", clock, today, day)).toBeNull(); // a Saturday
    expect(dayOfDate("2026-12-25", clock, today, day)).toBeNull(); // a holiday
    for (const bad of ["", "tomorrow", "2026-02-30", "16.11.2026", "2026-11-16T00:00:00Z"]) expect(dayOfDate(bad, clock, today, day), bad).toBeNull();
    // The demo counts calendar days from today.
    expect(dayOfDate("2026-11-12", { mode: "demo" }, today, 0)).toBe(0);
    expect(dayOfDate("2026-11-19", { mode: "demo" }, today, 3)).toBe(10);
  });
});

// ── pass, ask and check-in ────────────────────────────────────────────────────────────────────────────────────

const seats: SeatRow[] = [
  { id: "s_me", roleId: "role_desk", label: "Me", userId: "u_me", sort: 0 },
  { id: "s_prev", roleId: "role_prev", label: "Previous", userId: "u_prev", sort: 1 },
  { id: "s_other", roleId: "role_other", label: "Other", userId: "u_other", sort: 2 },
  { id: "s_up", roleId: "role_up", label: "Above", userId: "u_up", sort: 3 },
  { id: "s_vacant", roleId: "role_vacant", label: "Vacant", userId: null, sort: 4 },
];
const roles = [
  { id: "role_desk", reportsToId: "role_vacant" }, { id: "role_vacant", reportsToId: "role_up" }, { id: "role_up", reportsToId: null },
  { id: "role_prev", reportsToId: null }, { id: "role_other", reportsToId: null },
];
const route = (id: string, ownerSeatId: string | null, deputySeatId: string | null = null) => ({ id, ownerSeatId, deputySeatId }) as unknown as Route;
const routes = [route("r_prev", "s_prev"), route("r_other", "s_other", "s_me")];
const data = { seats, routes, roles };
const pass = (from: string, fromSeatId: string | null, toSeatId: string, extra: { back?: boolean; up?: boolean } = {}) =>
  ({ from, fromUserId: null, to: "Me", toSeatId, why: "A pass of the past", day: 1, fromSeatId, back: false, up: false, ...extra });
type PassCase = Pick<ReducedCase, "passes" | "handed" | "status" | "dueDay" | "assigneeRoleId">;
const kase = (over: Partial<PassCase> = {}): PassCase => ({ passes: 0, handed: [], status: "open", dueDay: TODAY + 5, assigneeRoleId: "role_desk", ...over });
const me = { seatIds: ["s_me"] };
const WHY = "It is the other desk's area";

describe("NOR pass ask and check-in sheets", () => {
  it("passSheet requires a why of 8 characters and a seat", () => {
    const sheet = (why: string, seatId: string | null) => passSheet(kase(), me, false, TODAY, data, { seatId, why });
    expect(sheet("Too few", "s_other").ok).toBe(false);
    expect(sheet("  Too few ", "s_other").ok).toBe(false);
    expect(sheet("Eight ok", null).ok).toBe(false);
    expect(sheet("Eight ok", "s_other").ok).toBe(true);
    expect(sheet("Eight ok", "s_other").mode).toBe("pass");
    expect(sheet("Too few", "s_other").payload()).toBeNull();
  });

  it("offers Not mine once, to the holder of the seat the last pass reached, going back to the seat it came from", () => {
    const passed = kase({ passes: 1, handed: [pass("Previous", "s_prev", "s_me")] });
    expect(passSheet(passed, me, false, TODAY, data).notMine).toEqual({ seatId: "s_prev", from: "Previous" });
    // Not for someone else, not once the pass was sent back (it would ping-pong), not with nothing passed to anyone.
    expect(passSheet(passed, { seatIds: ["s_other"] }, false, TODAY, data).notMine).toBeNull();
    expect(passSheet(kase({ passes: 2, handed: [pass("Previous", "s_prev", "s_me"), pass("Me", "s_me", "s_prev", { back: true })] }), { seatIds: ["s_prev"] }, true, TODAY, data).notMine).toBeNull();
    expect(passSheet(kase(), me, false, TODAY, data).notMine).toBeNull();
    expect(passSheet(kase({ passes: 1, handed: [pass("Previous", null, "s_me")] }), me, false, TODAY, data).notMine).toBeNull();
    const back = passSheet(passed, me, false, TODAY, data, { back: true, why: WHY });
    expect(back.mode).toBe("back");
    expect(back.ok).toBe(true);
    expect(back.payload()).toMatchObject({ toRoleHolderId: "s_prev", to: "Previous", why: WHY, back: true });
    expect(back.payload()).not.toHaveProperty("routeId");
    // Without Not mine on offer, back is no mode.
    expect(passSheet(kase(), me, false, TODAY, data, { back: true, seatId: "s_other", why: WHY }).mode).toBe("pass");
  });

  it("switches to Send up after two passes by people, with no seat list, and not for managers", () => {
    const two = kase({ passes: 2 });
    const up = passSheet(two, me, false, TODAY, data, { why: WHY });
    expect(up.mode).toBe("up");
    expect(up.ok).toBe(true);
    // The seat above the desk's role: the vacant role is skipped, the first occupied seat above it is taken.
    expect(up.up).toEqual({ seatId: "s_up", label: "Above" });
    expect(up.payload()).toMatchObject({ up: true, toRoleHolderId: "s_up", why: WHY });
    expect(passSheet(two, me, false, TODAY, data, { why: "Too few" }).ok).toBe(false);
    // Nobody above: the server answers ("ask a manager"); the payload carries no seat.
    const alone = passSheet(two, me, false, TODAY, { seats: seats.filter((s) => s.roleId !== "role_up"), routes, roles }, { why: WHY });
    expect(alone.up).toEqual({ seatId: null, label: "" });
    expect(alone.payload()).toEqual({ why: WHY, up: true });
    // The limit never stops a manager; one pass is no limit.
    expect(passSheet(two, me, true, TODAY, data, { seatId: "s_other", why: WHY }).mode).toBe("pass");
    expect(passSheet(kase({ passes: 1 }), me, false, TODAY, data, { seatId: "s_other", why: WHY }).mode).toBe("pass");
  });

  it("builds the pass payload with the route of the seat, the two-day floor on the answer date and keepsQuestion on an asked case", () => {
    const plain = passSheet(kase(), me, false, TODAY, data, { seatId: "s_other", why: WHY }).payload();
    expect(plain).toEqual({ to: "Other", toRoleHolderId: "s_other", why: WHY, routeId: "r_other" });
    // A seat that owns no route (and is no deputy) carries none; the deputy seat of a route carries that route.
    expect(passSheet(kase(), me, false, TODAY, data, { seatId: "s_up", why: WHY }).payload()).not.toHaveProperty("routeId");
    expect(passSheet(kase(), me, false, TODAY, { ...data, routes: [route("r_dep", null, "s_up")] }, { seatId: "s_up", why: WHY }).payload()).toMatchObject({ routeId: "r_dep" });
    // The new desk gets two working days: a nearer answer date is moved out, an equal or farther one stays.
    expect(passSheet(kase({ dueDay: TODAY + 1 }), me, false, TODAY, data, { seatId: "s_other", why: WHY }).payload()).toMatchObject({ dueDay: TODAY + 2 });
    expect(passSheet(kase({ dueDay: TODAY }), me, false, TODAY, data, { seatId: "s_other", why: WHY }).payload()).toMatchObject({ dueDay: TODAY + 2 });
    expect(passSheet(kase({ dueDay: TODAY + 2 }), me, false, TODAY, data, { seatId: "s_other", why: WHY }).payload()).not.toHaveProperty("dueDay");
    // An open question stays open for the new desk.
    expect(passSheet(kase({ status: "asked" }), me, false, TODAY, data, { seatId: "s_other", why: WHY }).payload()).toMatchObject({ keepsQuestion: true });
    expect(plain).not.toHaveProperty("keepsQuestion");
  });

  it("seatAboveRole takes the first occupied seat up the chain, never of the role itself, and survives a loop", () => {
    expect(seatAboveRole(seats, roles, "role_desk")?.id).toBe("s_up");
    expect(seatAboveRole(seats, roles, "role_up")).toBeNull();
    expect(seatAboveRole(seats, roles, null)).toBeNull();
    expect(seatAboveRole(seats, [{ id: "role_desk", reportsToId: "role_loop" }, { id: "role_loop", reportsToId: "role_desk" }], "role_desk")).toBeNull();
  });

  it("askSheet offers Discuss first from the second question, only with the discussion step on and while the case is open", () => {
    const ev = (type: string) => ({ id: type, type, actor: "x", actorUserId: null, target: "c", payload: {}, ts: 0, day: 0 }) as unknown as CaseEvent;
    const asked = (n: number, status: ReducedCase["status"] = "open") => ({ history: [ev("case.raised"), ...Array.from({ length: n }, () => ev("case.asked")), ev("case.answered")], status });
    expect(askSheet(asked(0), { discussion: true }).discussFirst).toBe(false);
    expect(askSheet(asked(1), { discussion: true }).discussFirst).toBe(true);
    expect(askSheet(asked(3), { discussion: true }).discussFirst).toBe(true);
    expect(askSheet(asked(1), { discussion: false }).discussFirst).toBe(false);
    expect(askSheet(asked(1, "discussion"), { discussion: true }).discussFirst).toBe(false);
  });

  it("checkinSheet lists who gave no view and hides Another round after lastDay", () => {
    const talk = (over: Partial<NonNullable<ReducedCase["discussion"]>> = {}) => ({
      discussion: { startedDay: 390, by: "x", byUserId: "u_x", invited: [], invitedUserIds: ["u_a", "u_b", "u_c"], missing: "", rounds: [], round: 1, ready: false, lastDay: 410, declinedUserIds: ["u_c"], ...over },
    }) as Pick<ReducedCase, "discussion">;
    const comments = [{ byUserId: "u_a", day: 395 }, { byUserId: "u_b", day: 385 }];
    // u_a commented since the discussion began; u_b before it; u_c declined: only u_b is missing.
    const open = checkinSheet(talk(), comments, 400);
    expect(open.noViewYet).toEqual(["u_b"]);
    expect(open.roundAllowed).toBe(true);
    expect(checkinSheet(talk(), comments, 410).roundAllowed).toBe(true); // the last day itself still counts
    expect(checkinSheet(talk(), comments, 411).roundAllowed).toBe(false);
    // The round began at the last check-in: an older comment does not count.
    expect(checkinSheet(talk({ rounds: [{ round: 1, day: 398, by: "x", byUserId: null, next: "round", open: [], note: "" }] }), comments, 400).noViewYet).toEqual(["u_a", "u_b"]);
    // No discussion, no list.
    expect(checkinSheet({ discussion: null }, comments, 500)).toEqual({ noViewYet: [], roundAllowed: true });
  });
});
