// What the raiser reads of their own case (plan SEE, decisions D12, D13, D14): the block of a no with its second look, the day a
// discussion is expected to end, and whether the desk decided before the raiser answered. Pure: a reduced case in, plain facts out.
import type { MessageKey } from "@/i18n";
import { appealOpen, noCategoryLabel, noCategoryOf, noReasonOf, type AnyNoCategory } from "./no";
import type { ReducedCase } from "./reducer";

/** Where the second look stands: open to ask for, asked and waiting, answered and the no kept, answered and the case reopened, or no longer possible. */
export type SecondLookState = "open" | "asked" | "kept" | "reopened" | "closed";

export type NoBlock = {
  category: AnyNoCategory;
  categoryLabel: MessageKey;
  reason: string;
  changeIf: string;
  revisitDay: number | null;
  duplicateOf: string | null;
  secondLook: {
    state: SecondLookState;
    /** The last day to ask while the state is `open`, else null. */
    until: number | null;
    askedDay: number | null;
    answer: { uphold: boolean; reason: string; day: number } | null;
  };
  decidedWhileAsked: boolean;
};

/**
 * The block a case shows when its latest decision is a no (D12): the category, the reason, what would make it a yes, the day it
 * comes back, the case or project it duplicates, and the second look. Null for anything else: no decision, a yes, or a case that
 * came back on its revisit day (a case reopened by a second look still shows its no, with that answer).
 */
export function noBlockOf(c: ReducedCase, today: number, appealDays: number): NoBlock | null {
  const a = c.appeal;
  // A second look that was not upheld reopened the case: its no (the latest decision) still tells the raiser what happened.
  const d = c.decided ?? (a?.decided?.uphold === false ? c.decisions[c.decisions.length - 1] ?? null : null);
  if (d === null || d.answer !== "no") return null;
  const category = noCategoryOf(d) ?? "other";
  let state: SecondLookState;
  if (a === null) state = appealOpen(c, today, appealDays) ? "open" : "closed";
  else if (a.decided === null) state = "asked";
  else if (a.decided.uphold) state = "kept";
  else state = c.decided === null ? "reopened" : "closed"; // decided again after the reopen: the one second look is used
  return {
    category, categoryLabel: noCategoryLabel(category), reason: noReasonOf(d), changeIf: d.changeIf, revisitDay: d.revisitDay, duplicateOf: d.duplicateOf,
    secondLook: {
      state, until: state === "open" ? d.day + appealDays : null, askedDay: a?.day ?? null,
      answer: a?.decided ? { uphold: a.decided.uphold, reason: a.decided.reason, day: a.decided.day } : null,
    },
    decidedWhileAsked: decidedWhileAsked(c),
  };
}

/** While a case is in a discussion the raiser sees the day it is expected to end instead of the answer date (D13); null otherwise. */
export const expectedByDay = (c: Pick<ReducedCase, "status" | "discussion">): number | null =>
  c.status === "discussion" && c.discussion !== null && c.discussion.lastDay > 0 ? c.discussion.lastDay : null;

/**
 * The desk decided while its question was open (D14): the latest case.decided in the history came after a case.asked with no
 * case.answered and no case.unanswered between the two. Events of one day are ordered by their place in the history.
 */
export function decidedWhileAsked(c: Pick<ReducedCase, "history">): boolean {
  const h = c.history;
  const decided = h.findLastIndex((e) => e.type === "case.decided");
  if (decided < 0) return false;
  const asked = h.findLastIndex((e, i) => i < decided && e.type === "case.asked");
  if (asked < 0) return false;
  return !h.slice(asked + 1, decided).some((e) => e.type === "case.answered" || e.type === "case.unanswered");
}
