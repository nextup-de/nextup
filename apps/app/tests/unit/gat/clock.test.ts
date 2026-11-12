// GAT-C1 (B1): what falls due on a review and on an approval step (plan GAT, D14, D23). Fixed literal states, never reduce(): the clock reads
// the case's review, its active approval run and the clock.due facts in its history. Every Due carries the run (originEventId) and the step
// revision (stepId), so each is written once per step revision.
import { expect, it } from "vitest";
import type { SeatRow } from "@/features/auth/identity";
import { EMPTY_APPROVAL_CONFIG, type ApprovalConfig, type ApprovalStep, type CaseApprovals, type CaseReview } from "@/features/approvals/types";
import type { CaseEvent } from "@/features/cases/events";
import type { State } from "@/features/cases/reducer";
import { DEFAULT_CALENDAR, DEMO_CLOCK } from "@/features/clock";
import { dueNow, hasFact, idemKeyOf, type Due } from "@/features/clock/due";
import { approvalAfterFacts, approvalDues, REVIEW_REMIND_DAYS } from "@/features/clock/kinds/approval";
import { writeApprovalDue } from "@/server/scheduler/writers/approval";

const SEATS: SeatRow[] = [
  { id: "seat_rev", roleId: "role_rev", label: "R. Review", userId: "u_rev", sort: 0 },
  { id: "seat_owner", roleId: "role_owner", label: "O. Owner", userId: "u_owner", sort: 1 },
  { id: "seat_fin", roleId: "role_fin", label: "F. Finance", userId: "u_fin", sort: 2 },
  { id: "seat_boss", roleId: "role_boss", label: "B. Boss", userId: "u_boss", sort: 3 },
  { id: "seat_sec", roleId: "role_sec", label: "S. Secretary", userId: "u_sec", sort: 4 },
  { id: "seat_vac", roleId: "role_vac", label: "V. Vacant", userId: null, sort: 5 },
];
const ROLES = [
  { id: "role_rev", title: "Idea manager", reportsToId: "role_boss", spendLimitEur: null },
  { id: "role_owner", title: "Owner", reportsToId: "role_boss", spendLimitEur: null },
  { id: "role_fin", title: "Finance", reportsToId: "role_boss", spendLimitEur: 5000 },
  { id: "role_boss", title: "Boss", reportsToId: null, spendLimitEur: 100000 },
  { id: "role_sec", title: "Secretary", reportsToId: "role_boss", spendLimitEur: null },
];
const ROUTE = { id: "r1", type: "t", keys: [], owner: { name: "O. Owner", role: "Owner" }, deputy: "", buddy: "", wait: "", ownerRoleId: "role_owner", ownerSeatId: "seat_owner" };
const COUNCIL = { id: "k1", name: "Investment council", memberRoleIds: ["role_fin"], secretaryRoleId: "role_sec", everyDays: 10, firstDay: 10 };
const CONFIG: ApprovalConfig = { ...EMPTY_APPROVAL_CONFIG, councils: [COUNCIL] };

let n = 0;
const fact = (target: string, payload: Record<string, unknown>): CaseEvent =>
  ({ id: "f" + n++, ts: 0, type: "clock.due", actor: "system:clock", actorUserId: null, target, payload, day: 0 }) as CaseEvent;
/** The fact the scheduler stores for a Due: kind, day and the fields the Due carries. */
const stored = (d: Due): CaseEvent => fact(d.target, { kind: d.kind, dueDay: d.dueDay, check: d.check, toRoleHolderId: d.toRoleHolderId, originEventId: d.originEventId, stepId: d.stepId });

const review = (over: Partial<CaseReview> = {}): CaseReview => ({ state: "pending", seatId: "seat_rev", since: 5, dueDay: 7, forwardFrom: 7, waitsOn: null, auto: false, ...over });
const step = (index: number, over: Partial<ApprovalStep> = {}, runId = "run1"): ApprovalStep =>
  ({ kind: "role", roleId: "role_fin", id: `${runId}:${index}`, state: "pending", dueDay: 10, dueRev: 0, seatId: null, answers: [], ...over });
const run = (steps: ApprovalStep[], over: Partial<CaseApprovals> = {}): CaseApprovals =>
  ({ runId: "run1", deciderUserId: "u_owner", decidingRoleId: "role_owner", since: 4, projectId: "p1", opened: true, supplement: false, costEur: 9000, steps, done: false, outcome: null, ...over });

type Lit = Record<string, unknown>;
const kase = (over: Lit = {}): Lit => ({ id: "c1", open: true, archived: false, status: "open", route: ROUTE, routeId: "r1", assigneeSeatId: "seat_rev", assigneeRoleId: "role_rev", review: null, approvals: null, approvalRuns: [], history: [], reopens: [], reopenSeq: null, decidedSeq: null, decided: null, appeal: null,
  handed: [], question: null, discussion: null, raisedDay: 1, dueDay: 999, ...over });
const state = (cases: Lit[], over: { clock?: State["clock"]; escalationDays?: number; config?: ApprovalConfig } = {}): State =>
  ({ day: 20, cases, projects: [], ideas: [], problems: [], ledger: {}, rules: { escalationDays: over.escalationDays ?? 3 }, seats: SEATS, routes: [ROUTE],
    clock: over.clock ?? { mode: "workdays", calendar: DEFAULT_CALENDAR }, approvals: { ...(over.config ?? CONFIG), roles: ROLES } }) as unknown as State;
const above = () => null;
const dues = (s: State, today: number) => approvalDues(s, today, above);
const ids = (ds: Due[]) => ds.map((d) => `${d.kind}${d.check ?? ""}@${d.dueDay}`);

it("GAT clock reminds the review seat after one working day", () => {
  const s = state([kase({ review: review() })]);
  expect(REVIEW_REMIND_DAYS).toBe(1);
  expect(dues(s, 5)).toEqual([]);
  const [d] = dues(s, 6);
  expect(d).toEqual({ kind: "review", target: "c1", dueDay: 6, check: 1, toRoleHolderId: "seat_rev", originEventId: "review:c1", stepId: "review:5", idemKey: idemKeyOf("review", "c1", 6, 1, "review:5") });
  expect(dues(s, 6)).toHaveLength(1); // the forward day (7) has not come
  // The reminder is written once: with its fact stored the Due is gone, and no later day brings it back.
  const done = state([kase({ review: review(), history: [stored(d)] })]);
  expect(dues(done, 6)).toEqual([]);
  expect(hasFact([stored(d)], "review", 6, 1, "review:5")).toBe(true);
  expect(approvalAfterFacts(d)).toBe(false);
});

it("GAT clock forwards on forwardFrom", () => {
  const s = state([kase({ review: review() })]);
  expect(ids(dues(s, 6))).toEqual(["review1@6"]);
  const out = dues(s, 7);
  expect(ids(out)).toEqual(["review1@6", "review2@7"]);
  const forward = out[1];
  expect(forward).toMatchObject({ target: "c1", toRoleHolderId: "seat_owner", originEventId: "review:c1", stepId: "review:5@7", idemKey: "clk:review:c1:7:2:review:5@7" });
  // The scheduler turns it into a forward by the clock to the route owner's seat, once the review is still pending.
  const ctx = { state: s, today: 7, companyId: "co" };
  expect(writeApprovalDue(forward, ctx)).toEqual({ type: "case.reviewed", payload: { outcome: "forward", routeId: "r1", toRoleHolderId: "seat_owner", auto: true } });
  expect(writeApprovalDue(out[0], ctx)).toBeNull(); // the reminder is a fact
  // A raise whose route is gone, or whose review is no longer pending, is not forwarded.
  expect(dues(state([kase({ review: review(), route: null, routeId: null })]), 9).filter((d) => d.check === 2)).toEqual([]);
  expect(writeApprovalDue(forward, { ...ctx, state: state([kase({ review: review({ state: "forwarded" }) })]) })).toEqual({ skip: true });
  expect(writeApprovalDue(forward, { ...ctx, state: state([kase({ route: null })]) })).toEqual({ skip: true });
  // The owner role has nobody on it: the route's own seat takes it.
  const vacant = state([kase({ review: review(), route: { ...ROUTE, ownerRoleId: "role_vac", ownerSeatId: "seat_vac" } })]);
  expect(dues(vacant, 7).find((d) => d.check === 2)?.toRoleHolderId).toBe("seat_vac");
  // The composed clock has it too, after the case area's own Dues.
  expect(dueNow(s, 7, above).filter((d) => d.kind === "review")).toHaveLength(2);
});

it("GAT clock does not forward while the raiser is asked", () => {
  const asked = state([kase({ status: "asked", review: review({ waitsOn: "raiser" }) })]);
  // The review's due day falls while the case is asked: nothing is forwarded, only the reminder stands.
  for (const today of [7, 8, 12]) expect(dues(asked, today).filter((d) => d.check === 2)).toEqual([]);
  expect(ids(dues(asked, 8))).toEqual(["review1@6"]);
  // The answer moves forwardFrom to the day after it (the reducer): from then on the forward is due.
  const answered = state([kase({ review: review({ waitsOn: null, forwardFrom: 9 }) })]);
  expect(dues(answered, 8).filter((d) => d.check === 2)).toEqual([]);
  expect(ids(dues(answered, 9))).toEqual(["review1@6", "review2@9"]);
});

it("GAT clock forwards after a late answer with a new key", () => {
  const before = dues(state([kase({ review: review() })]), 7).find((d) => d.check === 2)!;
  const after = dues(state([kase({ review: review({ forwardFrom: 9 }) })]), 9).find((d) => d.check === 2)!;
  expect(before.stepId).toBe("review:5@7");
  expect(after.stepId).toBe("review:5@9");
  expect(after.idemKey).not.toBe(before.idemKey);
  // A second raise of the same case (the review since another day) is another review.
  const again = dues(state([kase({ review: review({ since: 12, dueDay: 14, forwardFrom: 14 }) })]), 14).find((d) => d.check === 2)!;
  expect(again.idemKey).not.toBe(before.idemKey);
  // The same state asked twice gives the same key, so a second run writes nothing more.
  const twice = dues(state([kase({ review: review({ forwardFrom: 9 }) })]), 15).find((d) => d.check === 2)!;
  expect(twice.idemKey).toBe(after.idemKey);
});

it("GAT clock reminds and hands a late approval step to the seat above", () => {
  const active = (steps: ApprovalStep[], history: CaseEvent[] = []) => state([kase({ status: "approval", approvals: run(steps), history })]);
  const s = active([step(0)]);
  expect(dues(s, 9)).toEqual([]);
  const [remind] = dues(s, 10);
  expect(remind).toEqual({ kind: "approval", target: "c1", dueDay: 10, check: 1, toRoleHolderId: "seat_fin", originEventId: "run1", stepId: "run1:0@0", idemKey: "clk:approval:c1:10:1:run1:0@0" });
  expect(ids(dues(s, 12))).toEqual(["approval1@10"]); // escalation_days (3) have not passed
  // Once the reminder is stored, escalation_days later the step goes to the seat above its role.
  const reminded = active([step(0)], [stored(remind)]);
  expect(dues(reminded, 12)).toEqual([]);
  const [hand] = dues(reminded, 13);
  expect(hand).toEqual({ kind: "approval", target: "c1", dueDay: 13, check: 2, toRoleHolderId: "seat_boss", originEventId: "run1", stepId: "run1:0@0", idemKey: "clk:approval:c1:13:2:run1:0@0" });
  expect(writeApprovalDue(hand, { state: reminded, today: 13, companyId: "co" })).toBeNull(); // a fact: the reducer reads it
  // Nothing after that (Q3.7): the fact is stored, and a step that is already handed gets no second one.
  expect(dues(active([step(0)], [stored(remind), stored(hand)]), 30)).toEqual([]);
  expect(dues(active([step(0, { seatId: "seat_boss" })], [stored(remind)]), 30)).toEqual([]);
  // A handed step's reminder goes to the handed seat; with escalation off there is no second level; nobody above: no Due.
  expect(dues(active([step(0, { seatId: "seat_boss" })]), 10)[0].toRoleHolderId).toBe("seat_boss");
  expect(dues(state([kase({ approvals: run([step(0)]), history: [stored(remind)] })], { escalationDays: 0 }), 30)).toEqual([]);
  expect(dues(active([step(0, { roleId: "role_boss" })], [stored({ ...remind, stepId: "run1:0@0" })]), 13).filter((d) => d.check === 2)).toEqual([]);
  // A budget step is a role step for the clock.
  expect(ids(dues(active([step(0, { kind: "budget" })]), 10))).toEqual(["approval1@10"]);
});

it("GAT clock moves an unanswered council step to the next meeting", () => {
  const council = (over: Partial<ApprovalStep> = {}) => step(0, { kind: "council", roleId: undefined, councilId: "k1", dueDay: 10, ...over });
  const s = (st: ApprovalStep, history: CaseEvent[] = []) => state([kase({ status: "approval", approvals: run([st]), history })]);
  // The meeting day itself, nothing: the council may still answer.
  expect(dues(s(council()), 10)).toEqual([]);
  // The working day after, the step moves to the next meeting (firstDay + k * everyDays): the fact carries it.
  const [moved] = dues(s(council()), 11);
  expect(moved).toEqual({ kind: "council", target: "c1", dueDay: 20, originEventId: "run1", stepId: "run1:0@0", idemKey: "clk:council:c1:20:run1:0@0" });
  expect(writeApprovalDue(moved, { state: s(council()), today: 11, companyId: "co" })).toBeNull();
  // Written once; then the step (reduced with its new meeting day) is moved on again when that one passes unanswered.
  expect(dues(s(council(), [stored(moved)]), 11)).toEqual([]);
  expect(dues(s(council({ dueDay: 20 }), [stored(moved)]), 20)).toEqual([]);
  const [again] = dues(s(council({ dueDay: 20 }), [stored(moved)]), 21);
  expect(again).toMatchObject({ kind: "council", dueDay: 30, stepId: "run1:0@0" });
  // A meeting day that is not a multiple away still lands on the series.
  expect(dues(s(council({ dueDay: 14 })), 15)[0].dueDay).toBe(20);
  // A council that no longer exists is a role step for the clock (D33): its secretary is unknown, so the reminder has no seat but the Due stands.
  expect(ids(dues(s(council({ councilId: "k_gone", roleId: "role_fin" })), 10))).toEqual(["approval1@10"]);
});

it("GAT clock keeps two steps due on the same day apart", () => {
  const first = step(0, { state: "yes", dueDay: 10 });
  const second = step(1, { roleId: "role_boss", dueDay: 10 });
  const s0 = state([kase({ approvals: run([step(0, { dueDay: 10 }), step(1, { roleId: "role_boss", dueDay: 10 })]) })]);
  const [d0] = dues(s0, 10);
  expect(d0.stepId).toBe("run1:0@0");
  // Step 0 answered yes with its reminder stored: step 1, due the same day, gets its own.
  const s1 = state([kase({ approvals: run([first, second]), history: [stored(d0)] })]);
  const [d1] = dues(s1, 10);
  expect(d1).toMatchObject({ kind: "approval", dueDay: 10, check: 1, stepId: "run1:1@0", toRoleHolderId: "seat_boss" });
  expect(d1.idemKey).not.toBe(d0.idemKey);
  // Two cases with a step due on one day are two targets.
  const both = dues(state([kase({ id: "c1", approvals: run([step(0)]) }), kase({ id: "c2", approvals: run([step(0)]) })]), 10);
  expect(both.map((d) => d.idemKey)).toEqual(["clk:approval:c1:10:1:run1:0@0", "clk:approval:c2:10:1:run1:0@0"]);
});

it("GAT clock gives a sent-back step new Dues", () => {
  // Revision 0 was reminded on day 10 and sent back; revision 1 is due on day 15, or on the same day 10.
  const old = fact("c1", { kind: "approval", dueDay: 10, check: 1, stepId: "run1:0@0", originEventId: "run1" });
  const back = state([kase({ approvals: run([step(0, { dueRev: 1, dueDay: 15 })]), history: [old] })]);
  expect(dues(back, 14)).toEqual([]);
  expect(dues(back, 15)[0]).toMatchObject({ kind: "approval", dueDay: 15, check: 1, stepId: "run1:0@1", idemKey: "clk:approval:c1:15:1:run1:0@1" });
  // Sent back and re-answered on the same day: the due day is the same, the revision is not, so the reminder is written again.
  const same = state([kase({ approvals: run([step(0, { dueRev: 1, dueDay: 10 })]), history: [old] })]);
  expect(dues(same, 10)[0]).toMatchObject({ dueDay: 10, check: 1, stepId: "run1:0@1" });
  expect(dues(same, 10)[0].idemKey).not.toBe(dues(state([kase({ approvals: run([step(0)]) })]), 10)[0].idemKey);
  // And so is its second level.
  const oldHand = fact("c1", { kind: "approval", dueDay: 13, check: 2, stepId: "run1:0@0", originEventId: "run1" });
  const again = state([kase({ approvals: run([step(0, { dueRev: 1, dueDay: 10 })]), history: [old, oldHand, fact("c1", { kind: "approval", dueDay: 10, check: 1, stepId: "run1:0@1" })] })]);
  expect(dues(again, 13)[0]).toMatchObject({ check: 2, stepId: "run1:0@1", toRoleHolderId: "seat_boss" });
});

it("GAT clock keeps a second runs Dues apart from the first", () => {
  // The first run was reminded and handed on; the case was reopened and a new provisional yes started run 2, whose first step is due the same day.
  const history = [
    fact("c1", { kind: "approval", dueDay: 10, check: 1, stepId: "run1:0@0", originEventId: "run1" }),
    fact("c1", { kind: "approval", dueDay: 13, check: 2, stepId: "run1:0@0", originEventId: "run1" }),
  ];
  const first = run([step(0, { state: "no" })], { done: true, outcome: "no" });
  const second = run([step(0, {}, "run2")], { runId: "run2" });
  const s = state([kase({ approvals: second, approvalRuns: [first], history })]);
  const out = dues(s, 13);
  expect(ids(out)).toEqual(["approval1@10", "approval2@13"]);
  expect(out.map((d) => [d.originEventId, d.stepId])).toEqual([["run2", "run2:0@0"], ["run2", "run2:0@0"]]);
  expect(new Set(out.map((d) => d.idemKey)).size).toBe(2);
  expect(out.every((d) => !history.some((h) => hasFact([h], d.kind, d.dueDay, d.check, d.stepId)))).toBe(true);
  // The finished first run gives nothing; the same step in the active run is the one asked.
  expect(dues(state([kase({ approvals: null, approvalRuns: [first], history })]), 30)).toEqual([]);
});

it("GAT clock gives nothing in demo mode or for a finished run", () => {
  const live = { review: review(), approvals: run([step(0)]) };
  expect(dues(state([kase(live)], { clock: DEMO_CLOCK }), 99)).toEqual([]);
  expect(dueNow(state([kase(live)], { clock: DEMO_CLOCK }), 99, above)).toEqual([]);
  expect(dues(state([kase(live)]), 99).length).toBeGreaterThan(0);
  // A review that was forwarded or ended, a case that is archived, a run that is done or has no step waiting, a step without a due day.
  for (const r of [review({ state: "forwarded" }), review({ state: "ended" }), null]) expect(dues(state([kase({ review: r })]), 99)).toEqual([]);
  expect(dues(state([kase({ review: review(), archived: true })]), 99)).toEqual([]);
  expect(dues(state([kase({ approvals: run([step(0, { state: "no" })], { done: true, outcome: "no" }) })]), 99)).toEqual([]);
  expect(dues(state([kase({ approvals: run([step(0, { state: "yes" })]) })]), 99)).toEqual([]);
  expect(dues(state([kase({ approvals: run([step(0, { dueDay: null })]) })]), 99)).toEqual([]);
  expect(dues(state([kase()]), 99)).toEqual([]);
});
