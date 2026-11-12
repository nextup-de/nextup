// What the case page offers the viewer of the reasoned no (plan NOR, D14, D18, D20, D21, D27): the raiser's second look, the
// desk's answer to it, an invitee's "Not for me" and a manager's "Move to a desk". Pure: the reduced case, who is looking and
// the state in, plain facts out. The rules are the ones the server checks (./no, ./discussion); none is written down twice.
import type { Me } from "@/features/auth/identity";
import type { Role } from "@/config/roles";
import type { State } from "./reducer";
import type { ReducedCase } from "./reducer";
import { invitedTo } from "./discussion";
import { mayFollow, mayLink, mayMerge } from "./links";
import { appealOpen, mayAnswerAppeal } from "./no";
import { onDeskOf } from "./selectors";

export type CaseActions = {
  /** The raiser may ask for a second look of the latest no, once, until this working day (D18); null otherwise. */
  appeal: { until: number } | null;
  /** The viewer may answer the pending second look: its desk or a manager, never the person who said no (D18). */
  answerAppeal: boolean;
  /** The viewer is invited to the running discussion and may say it is not for them (D14). */
  declineInvite: boolean;
  /** A manager may move an open or asked case to another desk (D21). */
  moveToDesk: boolean;
  // The raiser sees the whole way (plan SEE, D15 to D18). Whether a given target qualifies is the picker's and the server's call (mayMerge, mayLink).
  /** The desk or a manager may close this case as a duplicate of another (D17). */
  merge: boolean;
  /** The desk or a manager may mark this case as related to another (D17). */
  link: boolean;
  /** The raiser may start a better idea from a no, any category, any time (D15). */
  betterIdea: boolean;
  /** The raiser may write the next version of an undecided case that is not in a discussion (the discussion has its own); the Versions panel decides what to show (D18). */
  revise: boolean;
  /** The case the raise looked like, when the viewer is on the desk or a manager and may open that case; null otherwise (D16). The raiser never gets it. */
  maybeSame: string | null;
};

const NONE: CaseActions = { appeal: null, answerAppeal: false, declineInvite: false, moveToDesk: false, merge: false, link: false, betterIdea: false, revise: false, maybeSame: null };

/** Any other case: the rules of merging and linking ask for one, and the question "may this person do it at all" does not depend on which. */
const ANY: { id: string; status: "open"; withdrawn: null; merged: null } = { id: "", status: "open", withdrawn: null, merged: null };

/**
 * What the viewer may do on this case page. `mayOpenCase` says whether the viewer may open another case (components/dashboard/derive canOpen):
 * the 'Maybe the same as' case is offered only when they may, so a hidden case's title never leaks (D16).
 */
export function caseActions(kase: ReducedCase, me: Me, role: Role, state: Pick<State, "day" | "rules" | "seats">, mayOpenCase: (caseId: string) => boolean = () => false): CaseActions {
  // A case its raiser took back has nothing left to do on it.
  if (kase.withdrawn !== null) return NONE;
  const isManager = role === "manager";
  const raiser = me.userId !== null && kase.fromUserId === me.userId;
  const d = kase.decided;
  const merge = mayMerge(kase, ANY, me, isManager);
  const link = mayLink(kase, ANY, me, isManager);
  return {
    merge,
    link,
    betterIdea: mayFollow(kase, me.userId),
    revise: raiser && d === null && kase.merged === null && kase.status !== "discussion",
    // Only to who may act on it: the same people merge and link, so a viewer without either never sees it (the raiser, a member).
    maybeSame: (merge || link) && kase.sameAs !== null && mayOpenCase(kase.sameAs) ? kase.sameAs : null,
    appeal: raiser && d !== null && appealOpen(kase, state.day, state.rules.appealDays) ? { until: d.day + state.rules.appealDays } : null,
    answerAppeal: mayAnswerAppeal(kase, me, isManager, state.seats),
    declineInvite: invitedTo(kase, me) && !raiser && !onDeskOf(kase, me),
    moveToDesk: isManager && (kase.open || kase.status === "asked"),
  };
}

/** A question to the raiser is open: asked and not answered yet. */
export const questionOpen = (kase: Pick<ReducedCase, "status" | "question">): boolean =>
  kase.status === "asked" && kase.question !== null && kase.question.answer === null;

/** What an append hands back: refused ones say so (the server's AppendOutcome); a call that returns nothing counts as done. */
const refused = (r: unknown): boolean => typeof r === "object" && r !== null && "ok" in r && (r as { ok: unknown }).ok === false;

/**
 * Revise the case and, when a question is open, also answer it with "See v<n>" (D20). The answer is written only after the revision
 * went through: a refused or failed revision leaves the question open. Returns whether the revision went through.
 */
export async function reviseThenAnswer(
  step: { revise: () => unknown; answer: (text: string) => unknown },
  version: number,
  open: boolean,
): Promise<boolean> {
  let done: unknown;
  try {
    done = await step.revise();
  } catch {
    return false;
  }
  if (refused(done)) return false;
  if (open) await step.answer(`See v${version}`);
  return true;
}
