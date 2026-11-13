// The approval area of the clock (REG/D6; plan GAT, D14, D23): what falls due on a review and on an approval step. The kinds:
//   review    check 1: the review seat is reminded one working day after the raise; check 2: the raise is forwarded to its desk (a case.reviewed,
//             written by the scheduler, never a fact) on the first day the clock may forward it, never while the raiser is asked (D14).
//   approval  check 1: the step's holders are reminded on its due day; check 2: escalation_days later the step is handed to the seat above (D23).
//   council   a council step nobody answered on its meeting day moves to the next meeting, the working day after.
// Every Due carries originEventId (the approval run's id, `review:<case id>` for a review) and stepId (`<step id>@<due revision>`, or the review's
// identity), and is checked with hasFact(history, kind, dueDay, check, stepId), so each is written once per step revision: two steps due on one day,
// a send-back and its re-answer, and a second run keep their own Dues. Nothing is due in demo mode (dueNow) or for a finished review or run.
import { seatsOfRole } from "@/features/auth/identity";
import { currentStep, dueStepId, lateSeat, nextMeetingDay } from "@/features/approvals/steps";
import type { State } from "@/features/cases/reducer";
import type { Due, SeatAbove } from "../due";
import { hasFact, idemKeyOf, targetSeat } from "./shared";

export const APPROVAL_DUE_KINDS = ["review", "approval", "council"] as const;
export type ApprovalDueKind = (typeof APPROVAL_DUE_KINDS)[number];

/** Working days after the raise the review seat is reminded (D14). */
export const REVIEW_REMIND_DAYS = 1;

export const approvalAfterFacts: (d: Due) => boolean = () => false;

/** The identity of a review's reminder (one per review) and of its forward (one per `forwardFrom`, so an answer that moves the day starts a new key). */
const reviewRemindId = (since: number): string => `review:${since}`;
const reviewForwardId = (since: number, forwardFrom: number): string => `review:${since}@${forwardFrom}`;

export const approvalDues: (state: State, today: number, above: SeatAbove) => Due[] = (state, today) => {
  if (state.clock.mode !== "workdays") return [];
  const out: Due[] = [];
  const { councils, roles } = state.approvals;

  for (const c of state.cases) {
    const r = c.review;
    if (!r || r.state !== "pending" || c.archived) continue;
    const origin = `review:${c.id}`;
    const remindDay = r.since + REVIEW_REMIND_DAYS;
    const remindId = reviewRemindId(r.since);
    if (today >= remindDay && !hasFact(c.history, "review", remindDay, 1, remindId)) {
      out.push({ kind: "review", target: c.id, dueDay: remindDay, check: 1, toRoleHolderId: r.seatId, originEventId: origin, stepId: remindId, idemKey: idemKeyOf("review", c.id, remindDay, 1, remindId) });
    }
    // The forward: an open question to the raiser waits (D14), and a raise without a route or whose route has no owner seat is not forwarded.
    if (r.waitsOn === null && today >= r.forwardFrom && c.route !== null) {
      const to = targetSeat(state, c.route, false) ?? c.route.ownerSeatId ?? null;
      const forwardId = reviewForwardId(r.since, r.forwardFrom);
      if (to !== null) {
        out.push({ kind: "review", target: c.id, dueDay: r.forwardFrom, check: 2, toRoleHolderId: to, originEventId: origin, stepId: forwardId, idemKey: idemKeyOf("review", c.id, r.forwardFrom, 2, forwardId) });
      }
    }
  }

  for (const c of state.cases) {
    const run = c.approvals;
    if (!run || run.done) continue;
    const step = currentStep(run);
    if (step === null || step.dueDay === null) continue;
    const stepId = dueStepId(step);
    const council = step.kind === "council" ? councils.find((k) => k.id === step.councilId) : undefined;
    if (council !== undefined) {
      // A meeting that passed without an answer: the step moves to the next one the working day after (a council that is gone is a role step below).
      const after = step.dueDay + 1;
      if (today < after) continue;
      const next = nextMeetingDay(council, after);
      if (!hasFact(c.history, "council", next, undefined, stepId)) {
        out.push({ kind: "council", target: c.id, dueDay: next, originEventId: run.runId, stepId, idemKey: idemKeyOf("council", c.id, next, undefined, stepId) });
      }
      continue;
    }
    // A budget or role step: its holders are reminded on its due day, the seat above gets it escalation_days later; nothing after that (Q3.7).
    const due = step.dueDay;
    if (today >= due && !hasFact(c.history, "approval", due, 1, stepId)) {
      const seat = step.seatId ?? (step.roleId === undefined ? null : seatsOfRole(state.seats, step.roleId).find((s) => s.userId !== null)?.id ?? null);
      out.push({ kind: "approval", target: c.id, dueDay: due, check: 1, toRoleHolderId: seat, originEventId: run.runId, stepId, idemKey: idemKeyOf("approval", c.id, due, 1, stepId) });
    }
    const days = state.rules.escalationDays;
    const second = due + days;
    if (days > 0 && step.seatId === null && today >= second && !hasFact(c.history, "approval", second, 2, stepId)) {
      const to = lateSeat(step, state.seats, roles, { councils });
      if (to !== null) {
        out.push({ kind: "approval", target: c.id, dueDay: second, check: 2, toRoleHolderId: to.id, originEventId: run.runId, stepId, idemKey: idemKeyOf("approval", c.id, second, 2, stepId) });
      }
    }
  }
  return out;
};
