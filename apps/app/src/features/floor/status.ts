// What a reporter without a name may read about the case behind their reference (plan FLR, D12).
// Pure: a reduced case in, plain facts out. Never a person's name, handle, comment or the raiser.
import type { ReducedCase } from "@/features/cases/reducer";

export type StatusStep = "sent" | "read" | "asked" | "decided" | "handed";

export type StatusView = {
  title: string;
  area: string | null;
  raisedDay: number;
  step: StatusStep;
  /** The title of the role that holds the case now. */
  roleTitle: string | null;
  decision: { answer: "yes" | "no"; reason: string } | null;
  /** The open question of the desk, with the id of the event a reply answers. */
  question: { eventId: string; text: string } | null;
};

export type StatusContext = {
  roleTitleOf: (roleId: string | null) => string | null;
  areaName: string | null;
};

/** The event a reply answers: the newest case.asked while the question is still unanswered. */
function openQuestion(kase: ReducedCase): { eventId: string; text: string } | null {
  if (kase.status !== "asked" || !kase.question || kase.question.answer !== null) return null;
  for (let i = kase.history.length - 1; i >= 0; i--) {
    const ev = kase.history[i];
    if (ev.type === "case.asked") return { eventId: ev.id, text: kase.question.text };
  }
  return null;
}

export function statusView(kase: ReducedCase, ctx: StatusContext): StatusView {
  const question = kase.decided ? null : openQuestion(kase);
  const step: StatusStep = kase.decided
    ? "decided"
    : question
      ? "asked"
      : kase.handed.length > 0
        ? "handed"
        : kase.read !== null
          ? "read"
          : "sent";
  return {
    title: kase.title,
    area: ctx.areaName,
    raisedDay: kase.raisedDay,
    step,
    roleTitle: ctx.roleTitleOf(kase.assigneeRoleId),
    decision: kase.decided ? { answer: kase.decided.answer, reason: kase.decided.reason } : null,
    question,
  };
}

/** One reply, 1-1000 characters after trimming (D12). */
export function checkReply(text: string): { ok: true; text: string } | { ok: false } {
  const trimmed = text.trim();
  return trimmed.length >= 1 && trimmed.length <= 1000 ? { ok: true, text: trimmed } : { ok: false };
}
