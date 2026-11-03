// The answer promise of a case (HD19, LOOP/D16): by which working day the submitter hears back, whether
// that held, and who holds the case now. Pure: today is passed in, never read from the system clock.
import { dateOfWorkday } from "@/features/clock/calendar";
import type { ClockSpec } from "@/features/clock";
import type { ReducedCase } from "./reducer";

export type AnswerPromiseState = "waiting" | "due-today" | "late" | "answered-on-time" | "answered-late";

export type AnswerPromise = {
  dueDay: number;
  dueDate: string | null; // ISO date in workdays mode, null in demo
  state: AnswerPromiseState;
  holder: "owner" | "deputy";
  holderRoleId: string | null;
  holderSeatId: string | null;
  handedDay: number | null; // the deadline hand-over
  escalatedRoleId: string | null; // the deputy role told while the owner keeps the case
  answeredDay: number | null;
};

export function answerPromise(c: ReducedCase, ctx: { today: number; clock: ClockSpec }): AnswerPromise {
  const dueDay = c.dueDay;
  const dueDate = ctx.clock.mode === "workdays" && dueDay >= 1 ? dateOfWorkday(dueDay, ctx.clock.calendar) : null;
  // A hand-over is not an answer: only the first decision or question counts.
  const answer = c.history.find((e) => e.type === "case.decided" || e.type === "case.asked");
  const answeredDay = answer ? answer.day | 0 : null;
  const handed = c.history.find((e) => e.type === "case.handed" && e.payload?.why === "deadline");
  const handedDay = handed ? handed.day | 0 : null;
  const holder = handed ? "deputy" : "owner";

  let state: AnswerPromiseState;
  if (answeredDay !== null) state = answeredDay <= dueDay ? "answered-on-time" : "answered-late";
  else if (ctx.today < dueDay) state = "waiting";
  else if (ctx.today === dueDay) state = "due-today";
  else state = "late";

  return {
    dueDay, dueDate, state, holder,
    holderRoleId: c.assigneeRoleId, holderSeatId: c.assigneeSeatId,
    handedDay,
    escalatedRoleId: holder === "owner" ? c.escalated?.toRoleId ?? null : null,
    answeredDay,
  };
}
