// GAT-U1 (B1): what the case page offers and shows of review and approvals (plan GAT, D12, D13, D18, D22, D23, D33): the reviewer's actions, none of
// them on their own idea, the cost and the flag for the desk, the current step's answers with run, step and revision, and every run with its steps and
// never a vote. Cases are reduced from fixed logs. Flat top-level tests (D36).
import { expect, it } from "vitest";
import { caseApprovalView } from "@/features/approvals/case-view";
import { EMPTY_APPROVAL_CONFIG } from "@/features/approvals/types";
import { meFor, type SeatRow } from "@/features/auth/identity";
import type { Role } from "@/config/roles";
import { caseActions } from "@/features/cases/case-actions";
import type { CaseEvent, CaseEventType, EventPayload } from "@/features/cases/events";
import { reduce, type ReduceSeed, type ReducedCase, type State } from "@/features/cases/reducer";
import type { Route, SeedRole } from "@/features/demo/types";

const SEATS: SeatRow[] = [
  { id: "s_rev", roleId: "role_review", label: "R. Review", userId: "u_rev", sort: 0 },
  { id: "s_rev2", roleId: "role_review", label: "E. Second", userId: "u_rev2", sort: 1 },
  { id: "s_own", roleId: "role_owner", label: "T. Vogel", userId: "u_own", sort: 2 },
  { id: "s_plant", roleId: "role_plant", label: "P. Plant", userId: "u_plant", sort: 3 },
  { id: "s_sec", roleId: "role_sec", label: "S. Secretary", userId: "u_sec", sort: 4 },
  { id: "s_head", roleId: "role_head", label: "K. Head", userId: "u_head", sort: 5 },
];
const ROLES: SeedRole[] = [
  { id: "role_head", orgUnitId: "u", reportsToId: null, title: "Director" },
  { id: "role_plant", orgUnitId: "u", reportsToId: "role_head", title: "Plant manager", spendLimitEur: 25_000 },
  { id: "role_review", orgUnitId: "u", reportsToId: "role_plant", title: "Idea manager" },
  { id: "role_owner", orgUnitId: "u", reportsToId: "role_plant", title: "Quality lead", spendLimitEur: 5_000 },
  { id: "role_sec", orgUnitId: "u", reportsToId: "role_plant", title: "Secretary" },
];
const route = (id: string, ownerSeatId: string, ownerRoleId: string, name: string, type: string): Route => ({
  id, type, keys: [id], owner: { name, role: "Owner", dept: "PRD" }, deputy: "H. Sander", buddy: "B", wait: "2 days", ownerSeatId, ownerRoleId, deputySeatId: "s_rev", deputyRoleId: "role_review",
});
const COUNCIL = { id: "k1", name: "Investment council", memberRoleIds: ["role_plant"], secretaryRoleId: "role_sec", everyDays: 10, firstDay: 20 };
const SEED: ReduceSeed = {
  cases: [], ideas: [], problems: [], promiseDays: 5, seats: SEATS, roles: ROLES,
  routes: [route("r2", "s_plant", "role_plant", "P. Plant", "Plant"), route("r1", "s_own", "role_owner", "T. Vogel", "Changeover")],
  approvals: { ...EMPTY_APPROVAL_CONFIG, review: { ...EMPTY_APPROVAL_CONFIG.review, on: true, roleId: "role_review" }, councils: [COUNCIL] },
};
const NAME: Record<string, string> = { u_rev: "R. Review", u_rev2: "E. Second", u_own: "T. Vogel", u_plant: "P. Plant", u_sec: "S. Secretary", u_head: "K. Head", u_ra: "J. Schmidt" };
const ev = (id: string, type: CaseEventType, by: string | null, target: string, payload: EventPayload, day: number, actor?: string): CaseEvent =>
  ({ id, ts: 0, type, actor: actor ?? (by === null ? "system:clock" : NAME[by]), actorUserId: by, target, payload, day });
/** A raise by `by`, stamped as reviewed: on a seat of the review role. */
const reviewed = (by = "u_ra", seat = "s_rev") =>
  ev("raise", "case.raised", by, "ca", { kind: "idea", title: "Shorter changeover", body: "b", routeId: "r1", assignee: "R. Review", assigneeRoleHolderId: seat, fromDept: "PRD", review: true, reviewDueDay: 2 }, 0);
/** A raise that went straight to the desk. */
const plain = () => ev("raise", "case.raised", "u_ra", "ca", { kind: "idea", title: "Shorter changeover", body: "b", routeId: "r1", assignee: "T. Vogel", assigneeRoleHolderId: "s_own", fromDept: "PRD" }, 0);

const state = (day: number, ...events: CaseEvent[]): State => reduce(SEED, { events, day });
const caseOf = (s: State): ReducedCase => s.cases.find((c) => c.id === "ca") as ReducedCase;
const actions = (s: State, userId: string, role: Role = "leader") => caseActions(caseOf(s), meFor(userId, SEATS), role, s);
const view = (s: State, userId: string) => caseApprovalView(caseOf(s), s, meFor(userId, SEATS));

const STEPS = [{ kind: "budget" as const, roleId: "role_plant", coversUpToEur: 25_000 }, { kind: "council" as const, councilId: "k1" }];
const provisional = (id: string, day: number, extra: EventPayload = {}) =>
  ev(id, "case.provisional", "u_own", "ca", { approvals: STEPS, stepDueDay: 9, costEur: 12_000, decidingRoleId: "role_owner", projectId: "p1", lead: "T. Vogel", leadUserId: "u_own", title: "Shorter changeover", draft: true, ...extra }, day);
const answer = (id: string, runId: string, index: number, approvalAnswer: "yes" | "conditions" | "back" | "no", by: string, day: number, extra: EventPayload = {}) =>
  ev(id, "case.approval", by, "ca", { runId, stepId: `${runId}:${index}`, dueRev: 0, step: index, approvalAnswer, reason: "", ...extra }, day);
const settle = (id: string, day: number, payload: EventPayload) => ev(id, "case.decided", null, "ca", payload, day, "system:approvals");
const NO = { answer: "no" as const, category: "no-fit" as const, reason: "It does not serve a goal of this year and it would break the gauge standard" };
const forwarded = (day = 1) => ev("fw", "case.reviewed", "u_rev", "ca", { outcome: "forward", routeId: "r1", toRoleHolderId: "s_own" }, day);

it("GAT case view gives the reviewer forward back merge link no and cost but no yes", () => {
  const s = state(1, reviewed());
  const a = actions(s, "u_rev");
  expect(a.forward).toEqual([
    { id: "r1", type: "Changeover", owner: "T. Vogel", proposed: true }, // the proposed route first, then the company's others
    { id: "r2", type: "Plant", owner: "P. Plant", proposed: false },
  ]);
  expect([a.back, a.merge, a.link, a.no, a.cost, a.moveToDesk]).toEqual([true, true, true, true, true, true]);
  expect([a.yes, a.answer, a.approve, a.approveConditions, a.sendBack, a.refuse]).toEqual([false, null, false, false, false, false]); // the review forwards; the desk says yes
  expect(view(s, "u_rev").review).toEqual({ pending: true, seatLabel: "R. Review", dueDay: 2, auto: false });
  // Another holder of the role and a manager may review too; the desk and the raiser may not.
  expect(actions(s, "u_rev2").forward).not.toBeNull();
  expect(actions(s, "u_boss", "manager").forward).not.toBeNull();
  for (const who of ["u_own", "u_plant", "u_ra"]) expect(actions(s, who, who === "u_ra" ? "member" : "leader").forward, who).toBeNull();
  // Once forwarded, the desk may say yes and the reviewer has nothing left.
  const after = state(2, reviewed(), forwarded());
  expect(actions(after, "u_own").yes).toBe(true);
  expect([actions(after, "u_rev").forward, actions(after, "u_rev").back, actions(after, "u_rev").no]).toEqual([null, false, false]);
  expect(view(after, "u_own").review?.pending).toBe(false);
});

it("GAT case view hides review actions on the own idea of the viewer", () => {
  // A reviewer raised it: the server placed it on the role's other seat. The raiser has no review action on it, nor does a manager who raised it.
  const own = state(1, reviewed("u_rev", "s_rev2"));
  const a = actions(own, "u_rev");
  expect([a.forward, a.back, a.no, a.cost, a.moveToDesk, a.merge, a.link, a.yes]).toEqual([null, false, false, false, false, false, false, false]);
  expect(actions(own, "u_rev2").forward).not.toBeNull(); // the other holder of the role still reviews it
  const manager = state(1, reviewed("u_plant", "s_rev"));
  expect(actions(manager, "u_plant", "manager")).toMatchObject({ forward: null, back: false, no: false, cost: false, moveToDesk: false, merge: false, link: false });
  // A raiser who is none of those sees none of them either.
  expect(actions(state(1, reviewed()), "u_ra", "member")).toMatchObject({ forward: null, back: false, no: false, cost: false, moveToDesk: false, merge: false, link: false, yes: false });
});

it("GAT case view gives the desk the cost and the flag", () => {
  const costed = (eur: number) => ev("cost", "case.costed", "u_own", "ca", { eur, basis: "Supplier quote" }, 1);
  const s = state(2, plain(), costed(12_000));
  expect(actions(s, "u_own").cost).toBe(true);
  expect(view(s, "u_own")).toMatchObject({ cost: { eur: 12_000, basis: "Supplier quote", by: "T. Vogel" }, flag: true }); // above the 5 000 fast lane
  expect(view(state(2, plain(), costed(4_000)), "u_own").flag).toBe(false);
  expect(view(state(2, plain()), "u_own")).toMatchObject({ cost: null, flag: false });
  // The review seat sees the flag too, the raiser does not and cannot record a cost.
  const inReview = state(2, reviewed(), ev("cost", "case.costed", "u_rev", "ca", { eur: 12_000, basis: "Quote" }, 1));
  expect(view(inReview, "u_rev").flag).toBe(true);
  expect(view(s, "u_ra").flag).toBe(false);
  expect(actions(s, "u_ra", "member").cost).toBe(false);
  expect(actions(s, "u_plant").cost).toBe(false); // neither desk nor review seat nor manager
  expect(actions(s, "u_boss", "manager").cost).toBe(true);
});

it("GAT case view gives the current step holder the answers with run step and dueRev", () => {
  const base = [plain(), provisional("prov", 1)];
  const s = state(3, ...base);
  const mine = { runId: "prov", stepId: "prov:0", dueRev: 0 };
  expect(view(s, "u_plant").myStep).toEqual(mine);
  const a = actions(s, "u_plant");
  expect([a.approve, a.approveConditions, a.sendBack, a.refuse]).toEqual([true, true, true, true]);
  expect(a.answer).toEqual(mine);
  // Not the decider, not the holder of a later step, not a manager who does not hold the role, not the raiser.
  for (const [who, role] of [["u_own", "leader"], ["u_sec", "leader"], ["u_boss", "manager"], ["u_ra", "member"]] as const) {
    expect(actions(s, who, role).answer, who).toBeNull();
    expect(view(s, who).myStep, who).toBeNull();
  }
  // After a send-back the form carries the new revision; after a yes the next step's holder gets it.
  const back = state(3, ...base, ev("b", "case.approval", "u_plant", "ca", { runId: "prov", stepId: "prov:0", dueRev: 0, step: 0, approvalAnswer: "back", reason: "Please attach the quote", nextStepDueDay: 8 }, 2));
  expect(view(back, "u_plant").myStep).toEqual({ runId: "prov", stepId: "prov:0", dueRev: 1 });
  const next = state(3, ...base, answer("a1", "prov", 0, "yes", "u_plant", 2, { nextStepDueDay: 20 }));
  expect(view(next, "u_plant").myStep).toBeNull();
  expect(view(next, "u_sec").myStep).toEqual({ runId: "prov", stepId: "prov:1", dueRev: 0 });
});

it("GAT case view shows the steps of the active and past runs without a vote", () => {
  const s = state(10, plain(), provisional("prov", 1), answer("a1", "prov", 0, "conditions", "u_plant", 2, { conditions: "The quote stays under 12k", nextStepDueDay: 20 }),
    ev("late", "clock.due", null, "ca", { kind: "council", dueDay: 30, originEventId: "prov", stepId: "prov:1@0" }, 21));
  const run = view(s, "u_ra").runs[0];
  expect(run).toMatchObject({ runId: "prov", active: true, opening: false, supplement: false, outcome: null });
  expect(run.steps).toEqual([
    { id: "prov:0", label: "Plant manager", kind: "budget", dueDay: 9, state: "conditions", seatLabel: null, handedRole: null, handed: false,
      answers: [{ answer: "conditions", reason: "", conditions: "The quote stays under 12k", present: null, day: 2 }] },
    { id: "prov:1", label: "Investment council", kind: "council", dueDay: 30, state: "pending", seatLabel: null, handedRole: null, handed: false, answers: [] },
  ]);
  // A step handed on when it was late says which seat has it now.
  const handed = state(10, plain(), provisional("prov", 1), ev("h", "clock.due", null, "ca", { kind: "approval", check: 2, dueDay: 9, toRoleHolderId: "s_head", originEventId: "prov", stepId: "prov:0@0" }, 15));
  expect(view(handed, "u_ra").runs[0].steps[0]).toMatchObject({ seatLabel: "K. Head", handedRole: "Director", handed: true });
  // Nobody's name or vote is in what the page is given: not who answered, not how a council voted.
  const council = state(25, plain(), provisional("prov", 1), answer("a1", "prov", 0, "yes", "u_plant", 2, { nextStepDueDay: 20 }), answer("a2", "prov", 1, "yes", "u_sec", 20, { present: 7 }));
  const shown = JSON.stringify(view(council, "u_ra").runs);
  for (const name of ["P. Plant", "S. Secretary", "u_plant", "u_sec", "byUserId", '"by"']) expect(shown, name).not.toContain(name);
  expect(view(council, "u_ra").runs[0].steps[1].answers).toEqual([{ answer: "yes", reason: "", conditions: null, present: 7, day: 20 }]);
});

it("GAT case view keeps the run history after a final yes", () => {
  const s = state(10, plain(), provisional("prov", 1), answer("a1", "prov", 0, "yes", "u_plant", 2, { nextStepDueDay: 20 }), answer("a2", "prov", 1, "yes", "u_sec", 3), settle("d", 4, { answer: "yes", projectId: "p1" }));
  const v = view(s, "u_plant");
  expect(v.runs).toHaveLength(1);
  expect(v.runs[0]).toMatchObject({ runId: "prov", active: false, opening: true, supplement: false, outcome: "yes" });
  expect(v.runs[0].steps.map((x) => x.state)).toEqual(["yes", "yes"]);
  expect(v.myStep).toBeNull(); // nothing left to answer
  expect(actions(s, "u_plant").answer).toBeNull();
});

it("GAT case view keeps the run history after a refusal and a reopen", () => {
  const refused = [plain(), provisional("prov1", 1), answer("a1", "prov1", 0, "no", "u_plant", 2, { reason: NO.reason }), settle("d1", 2, NO)];
  const asked = [ev("ask", "case.appealed", "u_ra", "ca", { text: "The quote came in lower, please look again", toRoleHolderId: "s_rev" }, 3),
    ev("look", "case.appeal.decided", "u_rev", "ca", { uphold: false, reason: "The new quote changes it" }, 3)];
  const afterNo = view(state(3, ...refused), "u_ra");
  expect(afterNo.runs.map((r) => [r.runId, r.active, r.opening, r.outcome])).toEqual([["prov1", false, false, "no"]]);
  expect(afterNo.runs[0].steps[0]).toMatchObject({ state: "no", answers: [{ answer: "no", reason: NO.reason }] });
  // The reopened case has no active run; a new run is the active one and the refused one stays, newest first.
  const reopened = view(state(4, ...refused, ...asked), "u_ra");
  expect(reopened.runs.map((r) => [r.runId, r.active, r.outcome])).toEqual([["prov1", false, "no"]]);
  const again = view(state(5, ...refused, ...asked, provisional("prov2", 4, { projectId: "p2" })), "u_ra");
  expect(again.runs.map((r) => [r.runId, r.active, r.opening, r.outcome])).toEqual([["prov2", true, false, null], ["prov1", false, false, "no"]]);
});

it("GAT case view shows a supplement run next to the opening run", () => {
  const decided = [plain(), provisional("prov", 1), answer("a1", "prov", 0, "yes", "u_plant", 2, { nextStepDueDay: 20 }), answer("a2", "prov", 1, "yes", "u_sec", 3), settle("d", 4, { answer: "yes", projectId: "p1" })];
  const sup = ev("sup", "case.provisional", "u_own", "ca", { supplement: true, approvals: [{ kind: "budget", roleId: "role_head", coversUpToEur: null }], stepDueDay: 14, costEur: 40_000, decidingRoleId: "role_owner" }, 10);
  const v = view(state(11, ...decided, sup), "u_head");
  expect(v.runs.map((r) => [r.runId, r.active, r.opening, r.supplement, r.outcome])).toEqual([["sup", true, false, true, null], ["prov", false, true, false, "yes"]]);
  expect(v.runs[0].steps).toEqual([{ id: "sup:0", label: "Director", kind: "budget", dueDay: 14, state: "pending", seatLabel: null, handedRole: null, handed: false, answers: [] }]);
  expect(v.myStep).toEqual({ runId: "sup", stepId: "sup:0", dueRev: 0 });
  // The decision stands during the supplement, and the finished run of a refused supplement is listed too.
  const refused = view(state(12, ...decided, sup, answer("c1", "sup", 0, "no", "u_head", 11, { reason: "No money for it this year" })), "u_head");
  expect(refused.runs.map((r) => [r.runId, r.active, r.supplement, r.outcome])).toEqual([["sup", false, true, "no"], ["prov", false, false, "yes"]]);
  expect(refused.myStep).toBeNull();
});
