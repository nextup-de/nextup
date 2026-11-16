// The parallel approval of named people (decisions A to D, Kevin and Sam, 16 Nov 2026): the first decider's yes asks at most three named approvers at
// once; the project draft opens only when all of them said yes; one no returns the idea to its raiser with the reason, who may change it and send it
// again, which asks everyone afresh; a pending approver gets one reminder three working days after they were asked and nothing else. Each test is a
// fixed log with the server's stamps written out, reduced as the app reduces it. Old sequential runs are covered by the other GAT tests.
import { expect, it } from "vitest";
import { nameApprovers } from "@/features/approvals/approvers";
import { mayAnswerStep, mayResendApproval } from "@/features/approvals/rights";
import { approvalLine, ideaApprovalStatus } from "@/features/approvals/status";
import { returnedRun } from "@/features/approvals/steps";
import { APPROVER_REMIND_DAYS, EMPTY_APPROVAL_CONFIG, MAX_APPROVERS, type ApprovalStepInput } from "@/features/approvals/types";
import { meFor, type SeatRow } from "@/features/auth/identity";
import type { Actor } from "@/features/cases/permissions";
import { mayAppend } from "@/features/cases/permissions";
import type { CaseEvent, CaseEventType, EventPayload } from "@/features/cases/events";
import { reduce, type ReduceSeed, type ReducedCase, type State } from "@/features/cases/reducer";
import { DEFAULT_CALENDAR } from "@/features/clock";
import { approvalDues } from "@/features/clock/kinds/approval";
import type { Route, Seed, SeedRole } from "@/features/demo/types";
import { inboxItems } from "@/features/inbox";
import { loopMails, type Person } from "@/features/loop/notice";
import { createT, translate } from "@/i18n";
import { prepareApprovalAppend } from "@/server/actions/append/approval";
import type { AppendCtx } from "@/server/actions/append/shared";

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
const SEED: ReduceSeed = {
  cases: [], ideas: [], problems: [], routes: ROUTES, promiseDays: 5, seats: SEATS, roles: ROLES, approvals: { ...EMPTY_APPROVAL_CONFIG },
  clock: { mode: "workdays", calendar: DEFAULT_CALENDAR },
};
const NAME: Record<string, string> = { u_own: "T. Vogel", u_plant: "P. Plant", u_fin: "F. Finance", u_legal: "A. Weber", u_fin2: "G. Second", u_ra: "J. Schmidt" };

const ev = (id: string, type: CaseEventType, by: string | null, payload: EventPayload, day: number, actor?: string): CaseEvent =>
  ({ id, ts: 0, type, actor: actor ?? (by === null ? "system:clock" : NAME[by]), actorUserId: by, target: "ca", payload, day });
const RAISE = ev("raise", "case.raised", "u_ra", { kind: "idea", title: "Shorter changeover", body: "b", routeId: "r1", assignee: "T. Vogel", assigneeRoleHolderId: "s_own", fromDept: "PRD" }, 0);
/** The three approvers as the server stamps them: the budget role through its head, a rule's role through its first holder, a person named by hand. */
const APPROVERS: ApprovalStepInput[] = [
  { kind: "budget", roleId: "role_plant", userId: "u_plant", coversUpToEur: 25_000 },
  { kind: "role", roleId: "role_fin", userId: "u_fin" },
  { kind: "person", userId: "u_legal", byHand: true },
];
const YES = ev("prov", "case.provisional", "u_own", {
  approvals: APPROVERS, parallel: true, stepDueDay: 2 + APPROVER_REMIND_DAYS, costEur: 12_000, decidingRoleId: "role_owner",
  projectId: "p1", lead: "T. Vogel", leadUserId: "u_own", title: "Shorter changeover", draft: true,
}, 2);
const answer = (id: string, runId: string, index: number, approvalAnswer: "yes" | "conditions" | "no", by: string, day: number, extra: EventPayload = {}) =>
  ev(id, "case.approval", by, { runId, stepId: `${runId}:${index}`, dueRev: 0, step: index, approvalAnswer, reason: "", nextStepDueDay: null, ...extra }, day);
const settle = (id: string, day: number) => ev(id, "case.decided", null, { answer: "yes", projectId: "p1" }, day, "system:approvals");
const NO_REASON = "Not this quarter: the line is booked for the audit";

const run = (day: number, ...events: CaseEvent[]): State => reduce(SEED, { events: [RAISE, ...events], day });
const caseOf = (s: State): ReducedCase => s.cases.find((c) => c.id === "ca") as ReducedCase;
const actor = (userId: string): Actor => ({ role: "member", userId, me: meFor(userId, SEATS), name: NAME[userId], handle: null });
const t = createT("en");

it("GAT parallel names at most three approvers, each step through its head, never the decider or the raiser", () => {
  const config = { councils: [{ id: "k1", name: "Council", memberRoleIds: [], secretaryRoleId: "role_legal", everyDays: 10, firstDay: 3 }] };
  const steps: ApprovalStepInput[] = [
    { kind: "budget", roleId: "role_plant", coversUpToEur: 25_000 },
    { kind: "council", councilId: "k1" }, // the council counts through its secretary
    { kind: "role", roleId: "role_owner" }, // only the decider holds it: their yes is given already, no step
    { kind: "role", roleId: "role_fin", userId: "u_someone" }, // the client's person is never taken
  ];
  const named = nameApprovers({ steps, people: ["u_ra", "u_fin2", "u_nobody"], seats: SEATS, config, exclude: ["u_own", "u_ra"] });
  expect(named.map((s) => [s.kind, s.userId])).toEqual([["budget", "u_plant"], ["council", "u_legal"], ["role", "u_fin"]]);
  expect(named).toHaveLength(MAX_APPROVERS); // u_fin2, named by hand, is the fourth and drops out; the raiser and a person without a seat never count
  // A role nobody holds keeps its step without a person: its holders answer it once somebody holds it.
  expect(nameApprovers({ steps: [{ kind: "role", roleId: "role_vacant" }], seats: SEATS, config, exclude: [] })).toEqual([{ kind: "role", roleId: "role_vacant" }]);
});

it("GAT parallel opens the draft only when every approver said yes", () => {
  const waiting = run(3, YES);
  // The first decider's yes opened nothing: the idea waits for its approvers, off the desk.
  expect(waiting.projects).toEqual([]);
  expect(caseOf(waiting)).toMatchObject({ status: "approval", decided: null, approvals: { parallel: true, yesEventId: "prov", opened: false, projectId: "p1" } });
  expect(caseOf(waiting).approvals?.steps.map((s) => [s.userId, s.state, s.dueDay])).toEqual([["u_plant", "pending", 5], ["u_fin", "pending", 5], ["u_legal", "pending", 5]]);
  // Everyone is asked at once, each only their own step; the decider and other holders of a role are not.
  const kase = caseOf(waiting);
  const form = (i: number) => ({ runId: "prov", stepId: `prov:${i}`, dueRev: 0 });
  expect([0, 1, 2].map((i) => mayAnswerStep(actor(["u_plant", "u_fin", "u_legal"][i]), kase, waiting, form(i)))).toEqual([true, true, true]);
  expect(mayAnswerStep(actor("u_fin2"), kase, waiting, form(1))).toBe(false); // holds role_fin too, but is not the named approver
  expect(mayAnswerStep(actor("u_fin"), kase, waiting, form(0))).toBe(false); // not their step
  expect(mayAnswerStep(actor("u_own"), kase, waiting, form(0))).toBe(false); // the decider
  expect(ideaApprovalStatus(kase, waiting)).toMatchObject({ state: "pending", approved: 0, total: 3, returned: null });
  expect(approvalLine(ideaApprovalStatus(kase, waiting), t)).toBe("Waiting on P. Plant, F. Finance, A. Weber");

  // Two yes, in any order: still no draft.
  const two = run(4, YES, answer("a1", "prov", 2, "conditions", "u_legal", 3, { conditions: "Legal checks the supplier contract" }), answer("a2", "prov", 1, "yes", "u_fin", 4));
  expect(two.projects).toEqual([]);
  expect(caseOf(two).status).toBe("approval");
  const status = ideaApprovalStatus(caseOf(two), two);
  expect(status).toMatchObject({ state: "pending", approved: 2, total: 3 });
  expect(status.waitingOn.map((a) => [a.userId, a.name])).toEqual([["u_plant", "P. Plant"]]);
  expect(approvalLine(status, t)).toBe("2 of 3 approved · waiting on P. Plant");

  // The last yes and the settle operation's decision: the draft opens now, as the first decider's yes asked for it.
  const done = run(5, YES, answer("a1", "prov", 2, "conditions", "u_legal", 3, { conditions: "Legal checks the supplier contract" }), answer("a2", "prov", 1, "yes", "u_fin", 4), answer("a3", "prov", 0, "yes", "u_plant", 5), settle("d", 5));
  expect(done.projects).toHaveLength(1);
  expect(done.projects[0]).toMatchObject({ id: "p1", draft: true, sources: ["ca"], leadUserId: "u_own", deciderUserId: "u_own", openedDay: 5 });
  expect(done.projects[0].waitsForApproval ?? false).toBe(false); // it never waited: it did not exist while the approvers voted
  expect(caseOf(done)).toMatchObject({ status: "decided", openingRunId: "prov", approvals: null });
  expect(caseOf(done).decided).toMatchObject({ answer: "yes", projectId: "p1" });
  expect(ideaApprovalStatus(caseOf(done), done)).toMatchObject({ state: "approved", approved: 3, total: 3, waitingOn: [] });
  expect(approvalLine(ideaApprovalStatus(caseOf(done), done), t)).toBe("3 of 3 approved");
  // A settle before the last yes decides nothing, and an answer from someone who is not named is ignored.
  const early = run(5, YES, answer("a2", "prov", 1, "yes", "u_fin", 4), settle("d", 5));
  expect(early.projects).toEqual([]);
  expect(caseOf(early).status).toBe("approval");
});

it("GAT parallel returns the idea to its raiser with the reason on one no", () => {
  const back = run(6, YES, answer("a1", "prov", 1, "yes", "u_fin", 3), answer("a2", "prov", 0, "no", "u_plant", 4, { reason: NO_REASON }));
  const kase = caseOf(back);
  // Nothing opened, nothing decided: the case is off the desk and with its raiser.
  expect(back.projects).toEqual([]);
  expect(kase).toMatchObject({ status: "approval", decided: null, approvals: null });
  expect(returnedRun(kase)?.returned).toEqual({ reason: NO_REASON, by: "P. Plant", byUserId: "u_plant", day: 4, stepId: "prov:0" });
  const status = ideaApprovalStatus(kase, back);
  expect(status).toMatchObject({ state: "returned", approved: 1, total: 3, waitingOn: [], returned: { reason: NO_REASON, by: "P. Plant" } });
  expect(status.approvers.map((a) => a.answer)).toEqual(["no", "approved", "pending"]);
  // Only the raiser may send it again; nobody overrules the no: the desk's yes and the remaining approver's answer change nothing.
  expect(mayResendApproval(actor("u_ra"), kase)).toBe(true);
  for (const who of ["u_own", "u_plant", "u_legal"]) expect(mayResendApproval(actor(who), kase), who).toBe(false);
  const overruled = run(6, YES, answer("a2", "prov", 0, "no", "u_plant", 4, { reason: NO_REASON }), answer("a3", "prov", 2, "yes", "u_legal", 5),
    ev("desk", "case.decided", "u_own", { answer: "yes", projectId: "p1", lead: "T. Vogel", leadUserId: "u_own" }, 5), settle("d", 5));
  expect(overruled.projects).toEqual([]);
  expect(caseOf(overruled)).toMatchObject({ status: "approval", decided: null });
  // The raiser finds it in their inbox; the approvers no longer do.
  const items = (userId: string) => inboxItems({ state: back, me: meFor(userId, SEATS), seats: SEATS, today: 6, demo: false, flags: { projects: true, discussion: true }, role: "member" }).filter((i) => i.kind === "approval");
  expect(items("u_ra")).toEqual([expect.objectContaining({ id: "approval-back:prov", ask: "part", caseId: "ca", href: "/cases/ca" })]);
  expect(items("u_legal")).toEqual([]);
  // The raiser is told who said no and why; and may take the idea back instead.
  const people: Person[] = Object.entries(NAME).map(([id, name]) => ({ id, name, email: `${id}@x.example` }));
  const mails = loopMails({ ev: answer("a2", "prov", 0, "no", "u_plant", 4, { reason: NO_REASON }), state: back, people, baseUrl: "https://x.test/acme" });
  const toRaiser = mails.find((m) => m.to === "u_ra@x.example");
  expect(toRaiser?.subject).toBe("Sent back to you: Shorter changeover");
  expect(toRaiser?.text).toContain(NO_REASON);
  expect(mayAppend(actor("u_ra"), { type: "case.withdrawn", target: "ca", payload: {} }, back).ok).toBe(true);
  expect(caseOf(run(6, YES, answer("a2", "prov", 0, "no", "u_plant", 4, { reason: NO_REASON }), ev("w", "case.withdrawn", "u_ra", {}, 5))).status).toBe("withdrawn");
});

it("GAT parallel restarts the approval when the raiser sends the idea again", async () => {
  const returned = [YES, answer("a1", "prov", 1, "yes", "u_fin", 3), answer("a2", "prov", 0, "no", "u_plant", 4, { reason: NO_REASON })];
  const back = run(6, ...returned);
  // The server stamps the same approvers, each asked afresh with a new reminder day; the client's payload counts for nothing else.
  const ctx = (userId: string): AppendCtx => ({ companyId: "co", viewer: { userId, role: "member" }, type: "case.provisional", target: "ca", payload: { resend: true, projectId: "p_other", approvals: [] }, state: back, seed: {} as Seed, locale: "en" });
  const stamped = await prepareApprovalAppend(ctx("u_ra"));
  expect(stamped).toEqual({ ok: true, payload: { resend: true, parallel: true, approvals: APPROVERS, stepDueDay: 6 + APPROVER_REMIND_DAYS } });
  expect(mayAppend(actor("u_ra"), { type: "case.provisional", target: "ca", payload: { resend: true } }, back).ok).toBe(true);
  expect(mayAppend(actor("u_own"), { type: "case.provisional", target: "ca", payload: { resend: true } }, back)).toEqual({ ok: false, error: translate("en", "approvals.permResendRaiser") });
  // While the approvers vote, nothing can be sent again.
  expect(mayAppend(actor("u_ra"), { type: "case.provisional", target: "ca", payload: { resend: true } }, run(3, YES)).ok).toBe(false);

  const revised = ev("rev", "case.revised", "u_ra", { title: "Shorter changeover after the audit", body: "After the audit, on line 2" }, 5);
  const again = ev("again", "case.provisional", "u_ra", { resend: true, parallel: true, approvals: APPROVERS, stepDueDay: 9 }, 6);
  const fresh = run(7, ...returned, revised, again);
  const kase = caseOf(fresh);
  // A fresh run: every approver pending again, the first decider and their yes kept, the returned run in the history.
  expect(kase.title).toBe("Shorter changeover after the audit");
  expect(kase.approvals).toMatchObject({ runId: "again", parallel: true, deciderUserId: "u_own", yesEventId: "prov", done: false, returned: null });
  expect(kase.approvals?.steps.map((s) => [s.userId, s.state, s.dueDay])).toEqual([["u_plant", "pending", 9], ["u_fin", "pending", 9], ["u_legal", "pending", 9]]);
  expect(kase.approvalRuns.map((r) => [r.runId, r.outcome])).toEqual([["prov", "no"]]);
  expect(ideaApprovalStatus(kase, fresh)).toMatchObject({ state: "pending", approved: 0, total: 3, returned: null, runId: "again" });
  expect(returnedRun(kase)).toBeNull();
  // An answer to the old run counts for nothing; all three yes on the new run open the draft from the first decider's yes.
  const stale = run(8, ...returned, revised, again, answer("old", "prov", 2, "yes", "u_legal", 7));
  expect(caseOf(stale).approvals?.steps[2].state).toBe("pending");
  const done = run(9, ...returned, revised, again, answer("b1", "again", 0, "yes", "u_plant", 7), answer("b2", "again", 1, "yes", "u_fin", 7), answer("b3", "again", 2, "yes", "u_legal", 8), settle("d2", 8));
  expect(done.projects).toHaveLength(1);
  expect(done.projects[0]).toMatchObject({ id: "p1", draft: true, deciderUserId: "u_own", leadUserId: "u_own", openedDay: 8, title: "Shorter changeover" });
  expect(caseOf(done)).toMatchObject({ status: "decided", openingRunId: "again" });
});

it("GAT parallel reminds each pending approver once, three working days after they were asked, and never escalates", () => {
  const above = () => null;
  const asked = run(4, YES);
  expect(approvalDues(asked, 4, above)).toEqual([]); // asked on day 2, due on day 5
  const due = approvalDues(asked, 5, above);
  expect(due.map((d) => [d.kind, d.check, d.dueDay, d.toRoleHolderId, d.stepId])).toEqual([
    ["approval", 1, 5, "s_plant", "prov:0@0"], ["approval", 1, 5, "s_fin", "prov:1@0"], ["approval", 1, 5, "s_legal", "prov:2@0"],
  ]);
  // Once the facts are written nothing else falls due, however long it waits: no hand-over, no escalation to a manager.
  const facts = due.map((d, i) => ev(`f${i}`, "clock.due", null, { kind: d.kind, dueDay: d.dueDay, check: d.check, toRoleHolderId: d.toRoleHolderId, originEventId: d.originEventId, stepId: d.stepId }, 5));
  expect(approvalDues(run(30, YES, ...facts), 30, above)).toEqual([]);
  // Who answered is not reminded.
  expect(approvalDues(run(5, YES, answer("a1", "prov", 1, "yes", "u_fin", 4)), 5, above).map((d) => d.stepId)).toEqual(["prov:0@0", "prov:2@0"]);
  // A resend asks again, so each approver gets one new reminder for the new run.
  const back = [YES, ...facts, answer("a2", "prov", 0, "no", "u_plant", 6, { reason: NO_REASON })];
  expect(approvalDues(run(12, ...back), 12, above)).toEqual([]);
  const again = ev("again", "case.provisional", "u_ra", { resend: true, parallel: true, approvals: APPROVERS, stepDueDay: 10 }, 7);
  expect(approvalDues(run(12, ...back, again), 12, above).map((d) => [d.originEventId, d.stepId, d.dueDay])).toEqual([["again", "again:0@0", 10], ["again", "again:1@0", 10], ["again", "again:2@0", 10]]);
});
