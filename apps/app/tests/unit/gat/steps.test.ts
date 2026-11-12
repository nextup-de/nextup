// GAT-B1 (B3): the current step of an approval run, its revision id, its due day, the seat it goes to when it is late and the runs of a case (plan GAT,
// D23, D33), pure and without a database. Flat top-level tests (D36).
import { expect, it } from "vitest";
import type { SeatRow } from "@/features/auth/identity";
import { currentStep, dueStepId, lateSeat, nextMeetingDay, runsOf, stepDueDay, stepLabel } from "@/features/approvals/steps";
import { EMPTY_APPROVAL_CONFIG, type ApprovalConfig, type ApprovalRoleInfo, type ApprovalStep, type CaseApprovals } from "@/features/approvals/types";

const ROLES: ApprovalRoleInfo[] = [
  { id: "director", title: "Director", reportsToId: null, spendLimitEur: null },
  { id: "plant", title: "Plant manager", reportsToId: "director", spendLimitEur: 25_000 },
  { id: "desk", title: "Setter lead", reportsToId: "plant", spendLimitEur: 5_000 },
  { id: "finance", title: "Finance", reportsToId: "plant", spendLimitEur: null },
  { id: "orphan", title: "Orphan", reportsToId: "gone", spendLimitEur: null },
];
const seat = (id: string, roleId: string, userId: string | null, sort: number): SeatRow => ({ id, roleId, label: id, userId, sort });
const SEATS: SeatRow[] = [seat("s_dir", "director", "u_dir", 0), seat("s_plant", "plant", "u_plant", 1), seat("s_desk", "desk", "u_desk", 2), seat("s_fin", "finance", "u_fin", 3)];
const COUNCIL = { id: "k1", name: "Investment council", memberRoleIds: ["plant", "finance"], secretaryRoleId: "finance", everyDays: 10, firstDay: 20 };
const CONFIG: ApprovalConfig = { ...EMPTY_APPROVAL_CONFIG, approvalDays: 5, councils: [COUNCIL] };

const step = (index: number, over: Partial<ApprovalStep> = {}, runId = "run1"): ApprovalStep => ({
  kind: "role", roleId: "plant", id: `${runId}:${index}`, state: "pending", dueDay: null, dueRev: 0, seatId: null, answers: [], ...over,
});
const run = (runId: string, steps: ApprovalStep[], over: Partial<CaseApprovals> = {}): CaseApprovals => ({
  runId, deciderUserId: "u_desk", decidingRoleId: "desk", since: 1, projectId: null, opened: true, supplement: false, costEur: 12_000, steps, done: false, outcome: null, ...over,
});

it("GAT steps finds the current step and its revision id", () => {
  expect(currentStep(null)).toBeNull();
  const active = run("run1", [step(0, { state: "yes" }), step(1, { kind: "council", councilId: "k1", roleId: undefined }), step(2)]);
  expect(currentStep(active)?.id).toBe("run1:1"); // the lowest step that is not yes or conditions
  expect(currentStep(run("run1", [step(0, { state: "conditions" }), step(1)]))?.id).toBe("run1:1");
  expect(currentStep(run("run1", [step(0, { state: "yes" }), step(1, { state: "yes" })]))).toBeNull(); // nothing left to answer
  expect(currentStep({ ...active, done: true, outcome: "yes" })).toBeNull(); // a finished run has no current step
  expect(dueStepId(step(1))).toBe("run1:1@0");
  expect(dueStepId(step(1, { dueRev: 2 }))).toBe("run1:1@2"); // a send-back is a new revision of the same step
});

it("GAT steps gives budget and role due days", () => {
  expect(stepDueDay(step(0, { kind: "budget" }), 10, CONFIG)).toBe(15);
  expect(stepDueDay(step(0, { kind: "role" }), 10, CONFIG)).toBe(15);
  expect(stepDueDay(step(0, { kind: "role" }), 10, { ...CONFIG, approvalDays: 1 })).toBe(11);
  expect(stepDueDay(step(0, { kind: "role" }), 10, { ...CONFIG, approvalDays: 30 })).toBe(40);
  // A council that is gone has no meeting: the step is due like a role step.
  expect(stepDueDay(step(0, { kind: "council", councilId: "deleted", roleId: undefined }), 10, CONFIG)).toBe(15);
});

it("GAT steps gives the next council meeting", () => {
  expect([5, 20, 21, 29, 30, 31, 59].map((from) => nextMeetingDay(COUNCIL, from))).toEqual([20, 20, 30, 30, 30, 40, 60]);
  const council = step(0, { kind: "council", councilId: "k1", roleId: undefined });
  expect(stepDueDay(council, 25, CONFIG)).toBe(30); // the meeting on or after the day the step became current
  expect(stepDueDay(council, 30, CONFIG)).toBe(30);
  expect(stepDueDay(council, 2, CONFIG)).toBe(20);
});

it("GAT steps gives the seat above when late", () => {
  const managers = new Set(["u_dir"]);
  expect(lateSeat(step(0, { roleId: "desk" }), SEATS, ROLES)?.id).toBe("s_plant"); // the role the step's role reports to
  expect(lateSeat(step(0, { kind: "budget", roleId: "plant" }), SEATS, ROLES)?.id).toBe("s_dir");
  expect(lateSeat(step(0, { roleId: "director" }), SEATS, ROLES)).toBeNull(); // nobody above the top
  expect(lateSeat(step(0, { roleId: "orphan" }), SEATS, ROLES)).toBeNull(); // the role above is not in the chart
  expect(lateSeat(step(0, { roleId: "desk" }), SEATS.map((s) => (s.roleId === "plant" ? { ...s, userId: null } : s)), ROLES)).toBeNull(); // nobody sits above
  // A role that is gone: the first manager role's seat.
  expect(lateSeat(step(0, { roleId: "deleted" }), SEATS, ROLES, { managerUserIds: managers })?.id).toBe("s_dir");
  expect(lateSeat(step(0, { roleId: "deleted" }), SEATS, ROLES)).toBeNull(); // no managers known
  // A council: its secretary's role reports to the seat above; a council that is gone goes to the manager.
  expect(lateSeat(step(0, { kind: "council", councilId: "k1", roleId: undefined }), SEATS, ROLES, { councils: [COUNCIL], managerUserIds: managers })?.id).toBe("s_plant");
  expect(lateSeat(step(0, { kind: "council", councilId: "deleted", roleId: undefined }), SEATS, ROLES, { councils: [COUNCIL], managerUserIds: managers })?.id).toBe("s_dir");
  // What to call a step: the role's title or the council's name; empty when it is gone.
  expect(stepLabel(step(0, { roleId: "desk" }), CONFIG, ROLES)).toEqual({ kind: "role", name: "Setter lead" });
  expect(stepLabel(step(0, { kind: "council", councilId: "k1", roleId: undefined }), CONFIG, ROLES)).toEqual({ kind: "council", name: "Investment council" });
  expect(stepLabel(step(0, { kind: "budget", roleId: "deleted" }), CONFIG, ROLES)).toEqual({ kind: "budget", name: "" });
});

it("GAT steps lists the active and finished runs with the opening run", () => {
  const first = run("r1", [step(0, { state: "yes" }, "r1")], { done: true, outcome: "yes" });
  const second = run("r2", [step(0, { state: "no" }, "r2")], { done: true, outcome: "no", supplement: true });
  const active = run("r3", [step(0, {}, "r3")], { supplement: true });
  const listed = runsOf({ approvals: active, approvalRuns: [first, second], openingRunId: "r1" });
  expect(listed.map((x) => [x.run.runId, x.active, x.opening])).toEqual([["r3", true, false], ["r2", false, false], ["r1", false, true]]); // the active run first, then newest first
  // No active run: the finished ones only.
  expect(runsOf({ approvals: null, approvalRuns: [first, second], openingRunId: "r1" }).map((x) => x.run.runId)).toEqual(["r2", "r1"]);
  expect(runsOf({ approvals: null, approvalRuns: [], openingRunId: null })).toEqual([]);
  // A done run still held as the case's run is listed once, and is not active.
  expect(runsOf({ approvals: first, approvalRuns: [first], openingRunId: "r1" }).map((x) => [x.run.runId, x.active, x.opening])).toEqual([["r1", false, true]]);
});
