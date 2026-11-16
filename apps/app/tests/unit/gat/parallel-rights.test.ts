// The parallel approval of named people in the reducer and the rights (decisions A, B and D, Kevin and Sam, 16 Nov 2026): a parallel run asks every
// named approver at once and only the person a step names answers it; the project draft opens only with the last yes; one no returns the idea to its
// raiser, nobody overrules it, and only the raiser may send it again (a fresh run on the first decider's yes) or withdraw it. Each test is a fixed log
// with the server's stamps written out. Runs without `parallel` are the old sequential runs and keep their own tests.
import { expect, it } from "vitest";
import { approverRoleIds, approverUserIds, mayAnswerStep, mayResendApproval } from "@/features/approvals/rights";
import { openSteps, returnedRun } from "@/features/approvals/steps";
import { EMPTY_APPROVAL_CONFIG, type ApprovalStepInput } from "@/features/approvals/types";
import { meFor, type SeatRow } from "@/features/auth/identity";
import { mayAppend, type Actor } from "@/features/cases/permissions";
import type { CaseEvent, CaseEventType, EventPayload } from "@/features/cases/events";
import { reduce, type ReduceSeed, type ReducedCase, type State } from "@/features/cases/reducer";
import type { Route, SeedRole } from "@/features/demo/types";
import { translate } from "@/i18n";

const SEATS: SeatRow[] = [
  { id: "s_own", roleId: "role_owner", label: "T. Vogel", userId: "u_own", sort: 0 },
  { id: "s_plant", roleId: "role_plant", label: "P. Plant", userId: "u_plant", sort: 1 },
  { id: "s_fin", roleId: "role_fin", label: "F. Finance", userId: "u_fin", sort: 2 },
  { id: "s_legal", roleId: "role_legal", label: "A. Weber", userId: "u_legal", sort: 3 },
  { id: "s_fin2", roleId: "role_fin", label: "G. Second", userId: "u_fin2", sort: 4 },
];
const ROLES: SeedRole[] = [
  { id: "role_plant", orgUnitId: "u", reportsToId: null, title: "Plant manager", spendLimitEur: 25_000 },
  { id: "role_owner", orgUnitId: "u", reportsToId: "role_plant", title: "Quality lead", spendLimitEur: 5_000 },
  { id: "role_fin", orgUnitId: "u", reportsToId: "role_plant", title: "Finance" },
  { id: "role_legal", orgUnitId: "u", reportsToId: "role_plant", title: "Legal" },
];
const ROUTES: Route[] = [{
  id: "r1", type: "Type", keys: ["k"], owner: { name: "T. Vogel", role: "Owner", dept: "PRD" }, deputy: "", buddy: "B", wait: "2 days",
  ownerSeatId: "s_own", ownerRoleId: "role_owner",
}];
const SEED: ReduceSeed = { cases: [], ideas: [], problems: [], routes: ROUTES, promiseDays: 5, seats: SEATS, roles: ROLES, approvals: { ...EMPTY_APPROVAL_CONFIG } };
const NAME: Record<string, string> = { u_own: "T. Vogel", u_plant: "P. Plant", u_fin: "F. Finance", u_legal: "A. Weber", u_fin2: "G. Second", u_ra: "J. Schmidt" };

const ev = (id: string, type: CaseEventType, by: string | null, payload: EventPayload, day: number, actor?: string): CaseEvent =>
  ({ id, ts: 0, type, actor: actor ?? (by === null ? "system:clock" : NAME[by]), actorUserId: by, target: "ca", payload, day });
const RAISE = ev("raise", "case.raised", "u_ra", { kind: "idea", title: "Shorter changeover", body: "b", routeId: "r1", assignee: "T. Vogel", assigneeRoleHolderId: "s_own", fromDept: "PRD" }, 0);
/** Three named approvers as the server stamps them: the budget role through its head, a rule's role through its first holder, a person named by hand. */
const APPROVERS: ApprovalStepInput[] = [
  { kind: "budget", roleId: "role_plant", userId: "u_plant", coversUpToEur: 25_000 },
  { kind: "role", roleId: "role_fin", userId: "u_fin" },
  { kind: "person", userId: "u_legal", byHand: true },
];
const YES = ev("prov", "case.provisional", "u_own", {
  approvals: APPROVERS, parallel: true, stepDueDay: 5, costEur: 12_000, decidingRoleId: "role_owner",
  projectId: "p1", lead: "T. Vogel", leadUserId: "u_own", title: "Shorter changeover", draft: true,
}, 2);
const answer = (id: string, runId: string, index: number, approvalAnswer: "yes" | "conditions" | "no" | "back", by: string, day: number, extra: EventPayload = {}) =>
  ev(id, "case.approval", by, { runId, stepId: `${runId}:${index}`, dueRev: 0, step: index, approvalAnswer, reason: "", nextStepDueDay: null, ...extra }, day);
const settle = (id: string, day: number) => ev(id, "case.decided", null, { answer: "yes", projectId: "p1" }, day, "system:approvals");
const NO_REASON = "Not this quarter: the line is booked for the audit";

const run = (day: number, ...events: CaseEvent[]): State => reduce(SEED, { events: [RAISE, ...events], day });
const caseOf = (s: State): ReducedCase => s.cases.find((c) => c.id === "ca") as ReducedCase;
const actor = (userId: string): Actor => ({ role: "member", userId, me: meFor(userId, SEATS), name: NAME[userId], handle: null });
const form = (i: number, runId = "prov") => ({ runId, stepId: `${runId}:${i}`, dueRev: 0 });

it("GAT parallel rights: every named approver answers their own step at once, nobody else", () => {
  const s = run(3, YES);
  const kase = caseOf(s);
  // The yes opened nothing; every step waits at once, due the day the server stamped.
  expect(s.projects).toEqual([]);
  expect(kase).toMatchObject({ status: "approval", decided: null, approvals: { parallel: true, yesEventId: "prov", opened: false, projectId: "p1" } });
  expect(openSteps(kase.approvals).map((x) => [x.userId, x.dueDay])).toEqual([["u_plant", 5], ["u_fin", 5], ["u_legal", 5]]);
  expect([0, 1, 2].map((i) => mayAnswerStep(actor(["u_plant", "u_fin", "u_legal"][i]), kase, s, form(i)))).toEqual([true, true, true]);
  expect(mayAnswerStep(actor("u_fin2"), kase, s, form(1)), "holds the role, is not the named person").toBe(false);
  expect(mayAnswerStep(actor("u_fin"), kase, s, form(0)), "another person's step").toBe(false);
  expect(mayAnswerStep(actor("u_own"), kase, s, form(0)), "the first decider").toBe(false);
  expect(mayAnswerStep({ ...actor("u_plant"), role: "manager" }, kase, s, { ...form(0), dueRev: 1 }), "a stale form").toBe(false);
  // They read the idea by user id, not every holder of their role.
  expect(approverUserIds(kase).sort()).toEqual(["u_fin", "u_legal", "u_plant"]);
  expect(approverRoleIds(kase, s)).toEqual([]);
  // Answered steps are no longer open; a send-back is not part of a parallel run.
  const one = run(4, YES, answer("a1", "prov", 1, "yes", "u_fin", 3), answer("b", "prov", 0, "back", "u_plant", 3, { reason: "The quote is missing" }));
  expect(openSteps(caseOf(one).approvals).map((x) => x.userId)).toEqual(["u_plant", "u_legal"]);
  expect(caseOf(one).approvals?.steps[0]).toMatchObject({ state: "pending", dueRev: 0, answers: [] });
  expect(mayAnswerStep(actor("u_fin"), caseOf(one), one, form(1))).toBe(false);
});

it("GAT parallel rights: the draft opens only with the last yes, from the first decider's yes", () => {
  const two = run(4, YES, answer("a1", "prov", 2, "conditions", "u_legal", 3, { conditions: "Legal checks the supplier contract" }), answer("a2", "prov", 1, "yes", "u_fin", 4));
  expect(two.projects).toEqual([]);
  expect(caseOf(two).status).toBe("approval");
  // A settle before the last yes decides nothing.
  expect(caseOf(run(5, YES, answer("a2", "prov", 1, "yes", "u_fin", 4), settle("d", 5))).status).toBe("approval");
  const done = run(5, YES, answer("a1", "prov", 2, "conditions", "u_legal", 3, { conditions: "Legal checks the supplier contract" }), answer("a2", "prov", 1, "yes", "u_fin", 4), answer("a3", "prov", 0, "yes", "u_plant", 5), settle("d", 5));
  expect(done.projects).toHaveLength(1);
  expect(done.projects[0]).toMatchObject({ id: "p1", draft: true, sources: ["ca"], leadUserId: "u_own", deciderUserId: "u_own", openedDay: 5 });
  expect(done.projects[0].waitsForApproval ?? false).toBe(false);
  expect(caseOf(done)).toMatchObject({ status: "decided", openingRunId: "prov", approvals: null });
  expect(caseOf(done).decided).toMatchObject({ answer: "yes", projectId: "p1" });
});

it("GAT parallel rights: one no returns the idea to its raiser and nobody overrules it", () => {
  const back = run(6, YES, answer("a1", "prov", 1, "yes", "u_fin", 3), answer("a2", "prov", 0, "no", "u_plant", 4, { reason: NO_REASON }));
  const kase = caseOf(back);
  expect(back.projects).toEqual([]);
  expect(kase).toMatchObject({ status: "approval", decided: null, approvals: null });
  expect(returnedRun(kase)?.returned).toEqual({ reason: NO_REASON, by: "P. Plant", byUserId: "u_plant", day: 4, stepId: "prov:0" });
  expect(mayResendApproval(actor("u_ra"), kase)).toBe(true);
  for (const who of ["u_own", "u_plant", "u_legal"]) expect(mayResendApproval(actor(who), kase), who).toBe(false);
  // The desk cannot decide it, the last approver's answer and a settle change nothing.
  expect(mayAppend(actor("u_own"), { type: "case.decided", target: "ca", payload: { answer: "yes" } }, back).ok).toBe(false);
  const overruled = run(6, YES, answer("a2", "prov", 0, "no", "u_plant", 4, { reason: NO_REASON }), answer("a3", "prov", 2, "yes", "u_legal", 5),
    ev("desk", "case.decided", "u_own", { answer: "yes", projectId: "p1", lead: "T. Vogel", leadUserId: "u_own" }, 5), settle("d", 5));
  expect(overruled.projects).toEqual([]);
  expect(caseOf(overruled)).toMatchObject({ status: "approval", decided: null });
  // The raiser may take it back instead.
  expect(mayAppend(actor("u_ra"), { type: "case.withdrawn", target: "ca", payload: {} }, back).ok).toBe(true);
  expect(mayAppend(actor("u_ra"), { type: "case.withdrawn", target: "ca", payload: {} }, run(3, YES)).ok, "not while the approvers vote").toBe(false);
  expect(caseOf(run(6, YES, answer("a2", "prov", 0, "no", "u_plant", 4, { reason: NO_REASON }), ev("w", "case.withdrawn", "u_ra", {}, 5))).status).toBe("withdrawn");
});

it("GAT parallel rights: the raiser sends it again, a fresh run among the same approvers on the first decider's yes", () => {
  const returned = [YES, answer("a1", "prov", 1, "yes", "u_fin", 3), answer("a2", "prov", 0, "no", "u_plant", 4, { reason: NO_REASON })];
  const back = run(6, ...returned);
  const resend = (who: string, s: State) => mayAppend(actor(who), { type: "case.provisional", target: "ca", payload: { resend: true } }, s);
  expect(resend("u_ra", back).ok).toBe(true);
  expect(resend("u_own", back)).toEqual({ ok: false, error: translate("en", "approvals.permResendRaiser") });
  expect(resend("u_ra", run(3, YES)), "not while the approvers vote").toEqual({ ok: false, error: translate("en", "approvals.permNotReturned") });

  const again = ev("again", "case.provisional", "u_ra", { resend: true, parallel: true, approvals: APPROVERS, stepDueDay: 9 }, 6);
  const fresh = run(7, ...returned, ev("rev", "case.revised", "u_ra", { title: "Shorter changeover after the audit", body: "After the audit" }, 5), again);
  const kase = caseOf(fresh);
  expect(kase.title).toBe("Shorter changeover after the audit");
  expect(kase.approvals).toMatchObject({ runId: "again", parallel: true, deciderUserId: "u_own", decidingRoleId: "role_owner", yesEventId: "prov", done: false, returned: null });
  expect(openSteps(kase.approvals).map((x) => [x.userId, x.dueDay])).toEqual([["u_plant", 9], ["u_fin", 9], ["u_legal", 9]]);
  expect(kase.approvalRuns.map((r) => [r.runId, r.outcome])).toEqual([["prov", "no"]]);
  expect(returnedRun(kase)).toBeNull();
  // A second resend while the new run votes is ignored; an answer to the old run counts for nothing.
  const twice = run(8, ...returned, again, ev("again2", "case.provisional", "u_ra", { resend: true, parallel: true, approvals: APPROVERS, stepDueDay: 10 }, 7), answer("old", "prov", 2, "yes", "u_legal", 7));
  expect(caseOf(twice).approvals).toMatchObject({ runId: "again" });
  expect(caseOf(twice).approvals?.steps[2].state).toBe("pending");
  // All three yes on the new run: the draft opens as the first decider's yes asked for it.
  const done = run(9, ...returned, again, answer("b1", "again", 0, "yes", "u_plant", 7), answer("b2", "again", 1, "yes", "u_fin", 7), answer("b3", "again", 2, "yes", "u_legal", 8), settle("d2", 8));
  expect(done.projects).toHaveLength(1);
  expect(done.projects[0]).toMatchObject({ id: "p1", draft: true, deciderUserId: "u_own", leadUserId: "u_own", openedDay: 8 });
  expect(caseOf(done)).toMatchObject({ status: "decided", openingRunId: "again" });
});
