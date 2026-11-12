// Plan INB, INB-A1: the one selector. Every role's items in three asks and one order, from a reduced state.
import { describe, expect, it } from "vitest";
import { meFor, type SeatRow } from "@/features/auth/identity";
import type { CaseEvent, CaseEventType, EventPayload } from "@/features/cases/events";
import { reduce, type ReduceSeed } from "@/features/cases/reducer";
import { DEFAULT_CALENDAR, type ClockSpec } from "@/features/clock";
import { addWorkdays, dateOfWorkday, workdayOf } from "@/features/clock/calendar";
import { LOCAL_SEED } from "@/features/demo";
import { PROBLEMS, PROMISE_DAYS } from "@/features/demo/seed";
import type { Idea } from "@/features/demo/types";
import { inboxCounts, inboxItems, type InboxItem } from "@/features/inbox";
import { markDue, orderItems } from "@/features/inbox/order";
import type { InboxSourceInput } from "@/features/inbox/sources/cases";
import { CONFIRM_DAYS } from "@/features/projects/confirm";

const WORKDAYS: ClockSpec = { mode: "workdays", calendar: DEFAULT_CALENDAR };
const seats: SeatRow[] = [
  { id: "seat_tv", roleId: "role_owner", label: "T. Vogel", userId: "u_tv", sort: 0 },
  { id: "seat_dep", roleId: "role_deputy", label: "H. Sander", userId: "u_hs", sort: 1 },
  { id: "seat_mgr", roleId: "role_mgr", label: "M. Chef", userId: "u_mgr", sort: 2 },
  { id: "seat_lb", roleId: "role_member", label: "L. Brandt", userId: "u_lb", sort: 3 },
  { id: "seat_x", roleId: "role_other", label: "X. Other", userId: "u_x", sort: 4 },
];
const routes = LOCAL_SEED.routes.map((x) => (x.id === "r1" ? { ...x, ownerSeatId: "seat_tv", ownerRoleId: "role_owner", deputySeatId: "seat_dep", deputyRoleId: "role_deputy" } : x));
const IDEA: Idea = {
  id: "i_old", title: "Old idea", criteria: { fit: true, urgent: false, kpi: null }, problem: "p1", status: "Awaiting decision", wait: 4,
  expected: "", upside: "", effort: "", proposedBy: "L. Brandt", rationale: "", team: [], teamNote: "",
};
const seed = (more: Partial<ReduceSeed> = {}): ReduceSeed => ({ cases: [], ideas: [], problems: PROBLEMS, routes, promiseDays: PROMISE_DAYS, seats, clock: WORKDAYS, ...more });

let n = 0;
const ev = (type: CaseEventType, target: string, payload: EventPayload = {}, day = 0, by: string | null = "u_lb"): CaseEvent =>
  ({ id: "q" + n++, ts: 0, type, actor: by === null ? "system:clock" : by === "u_lb" ? "L. Brandt" : by, actorUserId: by, target, payload, day });

const raised = (id: string, more: EventPayload = {}, day = 0) => ev("case.raised", id, { kind: "problem", title: "Case " + id, routeId: "r1", assignee: "T. Vogel", ...more }, day);
const TYPED = 31;
const project = [
  raised("c_p"),
  ev("case.decided", "c_p", { answer: "yes", projectId: "p_one", lead: "L. Brandt", leadUserId: "u_lb", title: "Shorter changeover" }, 0, "u_tv"),
  ev("project.baseline", "p_one", { metric: "m", unit: "min", value: 42, better: "down", source: "x" }),
  ev("project.started", "p_one"), ev("project.done", "p_one", {}, 1),
  ev("project.measured", "p_one", { check: 30, value: 30 }, TYPED),
];
const events = [
  raised("c_desk"),
  raised("c_ask"), ev("case.asked", "c_ask", { text: "Which line?" }, 1, "u_tv"),
  raised("c_disc"), ev("case.discussion", "c_disc", { invited: ["H. Sander"], invitedUserIds: ["u_hs"], missing: "cost" }, 1, "u_tv"),
  ...project,
];

const inputFor = (userId: string, today: number, more: Partial<InboxSourceInput> = {}, extra: Partial<ReduceSeed> = {}): InboxSourceInput => ({
  state: reduce(seed(extra), { events, day: today }), me: meFor(userId, seats), seats, today, demo: false, flags: { projects: true, discussion: true }, ...more,
});
const ids = (items: readonly InboxItem[]) => items.map((i) => i.id);

describe("INB items", () => {
  it("gives a desk holder their cases as decide, with the desk's role and the case's own link", () => {
    const items = inboxItems(inputFor("u_tv", 2));
    const decide = items.filter((i) => i.ask === "decide");
    expect(ids(decide).sort()).toEqual(["case:c_ask", "case:c_desk", "case:c_disc"]);
    expect(decide.every((i) => i.kind === "case" && i.deskRoleId === "role_owner")).toBe(true);
    expect(items.find((i) => i.id === "case:c_desk")).toMatchObject({ href: "/inbox?id=c_desk", caseId: "c_desk", title: "Case c_desk", late: false });
  });

  it("does not give the case to a person without a seat on the desk", () => {
    expect(inboxItems(inputFor("u_x", 2))).toEqual([]);
    expect(ids(inboxItems(inputFor("u_lb", 2))).filter((id) => id.startsWith("case:"))).toEqual([]);
    expect(inboxItems({ ...inputFor("u_tv", 2), me: meFor(null, seats) })).toEqual([]);
  });

  it("gives a raiser the question asked of them as part", () => {
    const items = inboxItems(inputFor("u_lb", 2));
    expect(items.find((i) => i.kind === "question")).toMatchObject({ id: "question:c_ask", ask: "part", caseId: "c_ask", href: "/cases/c_ask" });
    expect(items.filter((i) => i.kind === "question")).toHaveLength(1);
  });

  it("gives an invitee the view asked as part, only with the discussion flag and not when it is on their own desk", () => {
    const items = inboxItems(inputFor("u_hs", 2));
    expect(items.find((i) => i.id === "view:c_disc")).toMatchObject({ ask: "part", kind: "view", href: "/cases/c_disc", deskRoleId: null });
    expect(ids(inboxItems(inputFor("u_hs", 2, { flags: { projects: true, discussion: false } }))).filter((id) => id.startsWith("view:"))).toEqual([]);
    expect(ids(inboxItems(inputFor("u_tv", 2))).filter((id) => id.startsWith("view:"))).toEqual([]);
  });

  it("gives a confirmer the typed result as confirm, dated by its confirmation", () => {
    const items = inboxItems(inputFor("u_hs", TYPED));
    expect(items.find((i) => i.kind === "confirm")).toMatchObject({ id: "confirm:p_one", ask: "confirm", projectId: "p_one", href: "/projects/p_one", dueDay: TYPED + CONFIRM_DAYS, late: false });
    expect(ids(inboxItems(inputFor("u_lb", TYPED))).filter((id) => id.startsWith("confirm:"))).toEqual([]);
    expect(ids(inboxItems(inputFor("u_hs", TYPED, { flags: { projects: false, discussion: true } }))).filter((id) => id.startsWith("confirm:"))).toEqual([]);
  });

  it("gives a manager the reward due, and nobody else", () => {
    const rewarded = [...events, ev("project.measure.confirmed", "p_one", { check: 30 }, TYPED + 1, "u_hs"), ev("project.measured", "p_one", { check: 90, value: 28 }, TYPED + 60), ev("project.measure.confirmed", "p_one", { check: 90 }, TYPED + 61, "u_hs")];
    const at = (userId: string, role?: InboxSourceInput["role"]): InboxSourceInput => ({ ...inputFor(userId, TYPED + 62), state: reduce(seed(), { events: rewarded, day: TYPED + 62 }), role });
    const mine = inboxItems(at("u_mgr", "manager")).find((i) => i.kind === "reward");
    expect(mine).toMatchObject({ id: "reward:p_one", ask: "confirm", projectId: "p_one", dueDay: null });
    expect(inboxItems(at("u_hs", "leader")).some((i) => i.kind === "reward")).toBe(false);
    expect(inboxItems(at("u_mgr")).some((i) => i.kind === "reward")).toBe(false);
  });

  it("gives a lead their project move as part", () => {
    const lead = [raised("c_q"), ev("case.decided", "c_q", { answer: "yes", projectId: "p_two", lead: "L. Brandt", leadUserId: "u_lb", title: "Second" }, 0, "u_tv")];
    const input: InboxSourceInput = { ...inputFor("u_lb", 3), state: reduce(seed(), { events: lead, day: 3 }) };
    const item = inboxItems(input).find((i) => i.kind === "move");
    expect(item).toMatchObject({ id: "move:p_two", ask: "part", projectId: "p_two", href: "/projects/p_two" });
    expect(inboxItems({ ...input, me: meFor("u_x", seats) })).toEqual([]);
  });

  it("gives the manager's legacy idea only in a demo company, and drops the case it came from", () => {
    const linked = [raised("c_l", { assigneeRoleHolderId: "seat_mgr" })];
    const base = (more: Partial<InboxSourceInput>): InboxSourceInput => ({
      ...inputFor("u_mgr", 2), state: reduce(seed({ ideas: [IDEA], cases: [] }), { events: linked, day: 2 }), role: "manager", ...more,
    });
    expect(ids(inboxItems(base({ demo: true })))).toEqual(["case:c_l", "idea:i_old"]);
    expect(inboxItems(base({ demo: true })).find((i) => i.kind === "idea")).toMatchObject({ ask: "decide", dueDay: null, href: "/inbox?id=i_old" });
    expect(ids(inboxItems(base({ demo: false })))).toEqual(["case:c_l"]);
    expect(ids(inboxItems(base({ demo: true, role: "leader" })))).toEqual(["case:c_l"]);
    const state = reduce(seed({ ideas: [IDEA] }), { events: linked, day: 2 });
    state.cases[0].linkedIdea = "i_old";
    expect(ids(inboxItems(base({ demo: true, state })))).toEqual(["idea:i_old"]);
    expect(ids(inboxItems(base({ demo: false, state })))).toEqual(["case:c_l"]);
  });

  it("counts a late decide item once in total, once in decide and once in late; a confirm item adds to total only", () => {
    const late = inboxItems(inputFor("u_tv", 30)).filter((i) => i.id === "case:c_desk");
    expect(late[0]).toMatchObject({ ask: "decide", late: true });
    expect(inboxCounts(late)).toEqual({ total: 1, decide: 1, late: 1, waiting: 0 });
    const confirm = inboxItems(inputFor("u_hs", TYPED)).filter((i) => i.kind === "confirm");
    expect(inboxCounts([...late, ...confirm])).toEqual({ total: 2, decide: 1, late: 1, waiting: 0 });
  });

  it("counts waiting as Do my part, never as work waiting on someone else", () => {
    const items = inboxItems(inputFor("u_lb", 2));
    expect(inboxCounts(items)).toEqual({ total: items.length, decide: 0, late: 0, waiting: items.filter((i) => i.ask === "part").length });
    expect(inboxCounts(items).waiting).toBe(1);
  });

  it("marks late and due soon from the due day, and lists each item once in the inbox's order", () => {
    const items = inboxItems(inputFor("u_tv", 7));
    expect(new Set(ids(items)).size).toBe(items.length);
    const desk = items.find((i) => i.id === "case:c_desk");
    expect(desk).toMatchObject({ late: desk!.dueDay! < 7, dueSoon: desk!.dueDay! - 7 === 1 });
    expect(ids(items)).toEqual(ids(orderItems(items, 7)));
  });
});

const item = (id: string, over: Partial<InboxItem> = {}): InboxItem => ({
  id, ask: "decide", kind: "case", title: id, href: "/x", dueDay: null, late: false, dueSoon: false, pinned: false, deskRoleId: null, ...over,
});

describe("INB order", () => {
  const TODAY = 10;
  const list = [
    item("rest-far", { dueDay: 15 }),
    item("none-old"),
    item("soon", { dueDay: 11 }),
    item("late-2", { dueDay: 8 }),
    item("today", { dueDay: 10 }),
    item("pinned-far", { dueDay: 30, pinned: true }),
    item("late-1", { dueDay: 9 }),
    item("rest-12", { dueDay: 12 }),
    item("none-new"),
    item("pinned-none", { pinned: true }),
    item("pinned-late", { dueDay: 1, pinned: true }),
  ];

  it("comes pinned, then late, then due soon, then the rest, each by due day, no due day last", () => {
    expect(ids(orderItems(list, TODAY))).toEqual([
      "pinned-late", "pinned-far", "pinned-none", // pinned: by due day, none last
      "late-2", "late-1", // late: the oldest due day first
      "soon", // exactly one working day left
      "today", "rest-12", "rest-far", "none-old", "none-new", // the rest: due today is not late
    ]);
  });

  it("keeps the order the items came in when the due days are equal (oldest first), and leaves the input alone", () => {
    const before = ids(list);
    expect(ids(orderItems([item("older", { dueDay: 12 }), item("younger", { dueDay: 12 }), item("n1"), item("n2")], TODAY))).toEqual(["older", "younger", "n1", "n2"]);
    orderItems(list, TODAY);
    expect(ids(list)).toEqual(before);
  });

  it("never calls an item without a due day late or due soon", () => {
    expect(markDue(item("a"), TODAY)).toMatchObject({ late: false, dueSoon: false });
    expect(ids(orderItems([item("none"), item("rest", { dueDay: 14 })], TODAY))).toEqual(["rest", "none"]);
  });

  it("marks late before today, due soon at one day left, and an item due today as neither", () => {
    expect(markDue(item("a", { dueDay: 9 }), TODAY)).toMatchObject({ late: true, dueSoon: false });
    expect(markDue(item("b", { dueDay: 10 }), TODAY)).toMatchObject({ late: false, dueSoon: false });
    expect(markDue(item("c", { dueDay: 11 }), TODAY)).toMatchObject({ late: false, dueSoon: true });
    expect(markDue(item("d", { dueDay: 12 }), TODAY)).toMatchObject({ late: false, dueSoon: false });
  });

  it("counts one working day across a weekend and a holiday with the company calendar", () => {
    // Friday 6 Nov 2026 is a working day; Monday 9 Nov is the next one, so it is one day left.
    const fri = workdayOf(new Date("2026-11-06T12:00:00Z"), DEFAULT_CALENDAR);
    const mon = workdayOf(new Date("2026-11-09T12:00:00Z"), DEFAULT_CALENDAR);
    expect(dateOfWorkday(fri, DEFAULT_CALENDAR)).toBe("2026-11-06");
    expect(mon - fri).toBe(1);
    expect(markDue(item("a", { dueDay: mon }), fri)).toMatchObject({ late: false, dueSoon: true });
    // A Monday holiday (the company's own): the next working day after Friday is Tuesday.
    const cal = { ...DEFAULT_CALENDAR, extraHolidays: ["2026-11-09"] };
    const fri2 = workdayOf(new Date("2026-11-06T12:00:00Z"), cal);
    const tue = workdayOf(new Date("2026-11-10T12:00:00Z"), cal);
    expect(addWorkdays("2026-11-06", 1, cal)).toBe("2026-11-10");
    expect(tue - fri2).toBe(1);
    expect(ids(orderItems([item("rest", { dueDay: tue + 1 }), item("soon", { dueDay: tue })], fri2))).toEqual(["soon", "rest"]);
    // Over the weekend itself the day number stays Friday's, so Monday is still one day left, not late.
    const sat = workdayOf(new Date("2026-11-07T12:00:00Z"), DEFAULT_CALENDAR);
    expect(sat).toBe(fri);
    expect(markDue(item("due-fri", { dueDay: fri }), sat)).toMatchObject({ late: false });
  });

  it("takes the gap rule as a parameter", () => {
    const two = (today: number, due: number) => due - today === 2;
    expect(ids(orderItems([item("a", { dueDay: 15 }), item("b", { dueDay: 12 })], TODAY, two))).toEqual(["b", "a"]);
    expect(ids(orderItems([item("a", { dueDay: 11 }), item("b", { dueDay: 11, pinned: true })], TODAY, two))).toEqual(["b", "a"]);
  });
});
