// What the case page offers the viewer of the reasoned no (plan NOR, D14, D18, D20, D21, D27): the raiser's second look, the
// desk's answer to it, an invitee's "Not for me" and a manager's "Move to a desk". Pure: the reduced case, who is looking and
// the state in, plain facts out. The rules are the ones the server checks (./no, ./discussion); none is written down twice.
import type { Me } from "@/features/auth/identity";
import { caseApprovalView } from "@/features/approvals/case-view";
import { isOwnIdea, mayCost, mayMoveToDesk, mayReview } from "@/features/approvals/rights";
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
  // Review and approvals (plan GAT, GAT-U1, D12, D13, D18, D22). The rules are those of features/approvals/rights; none is written down twice.
  /** The reviewer may send the raise on to its desk (D13): the routes to pick from, the one it was proposed for first; null for anyone else. */
  forward: { id: string; type: string; owner: string; proposed: boolean }[] | null;
  /** The reviewer may send the raise back to the author: an ordinary question, the review stays pending (D13). */
  back: boolean;
  /** The reviewer may give a reasoned no (NOR's), the only decision the review has (D13). */
  no: boolean;
  /** The viewer may say yes from here: on the desk, not while the review is pending and not while the case waits for approval (D13, D21). */
  yes: boolean;
  /** The viewer may record the cost estimate (D18). */
  cost: boolean;
  /** The current step of the active run and the identity an answer to it must carry, when the viewer may answer it (D22); null otherwise. */
  answer: { runId: string; stepId: string; dueRev: number } | null;
  /** The four answers of that step: each is open to whoever holds `answer`. */
  approve: boolean;
  approveConditions: boolean;
  sendBack: boolean;
  refuse: boolean;
};

const NONE: CaseActions = {
  appeal: null, answerAppeal: false, declineInvite: false, moveToDesk: false, merge: false, link: false, betterIdea: false, revise: false, maybeSame: null,
  forward: null, back: false, no: false, yes: false, cost: false, answer: null, approve: false, approveConditions: false, sendBack: false, refuse: false,
};

/** Any other case: the rules of merging and linking ask for one, and the question "may this person do it at all" does not depend on which. */
const ANY: { id: string; status: "open"; withdrawn: null; merged: null } = { id: "", status: "open", withdrawn: null, merged: null };

/**
 * What the viewer may do on this case page. `mayOpenCase` says whether the viewer may open another case (components/dashboard/derive canOpen):
 * the 'Maybe the same as' case is offered only when they may, so a hidden case's title never leaks (D16).
 */
export function caseActions(
  kase: ReducedCase, me: Me, role: Role, state: Pick<State, "day" | "rules" | "seats" | "routes" | "approvals" | "projects">, mayOpenCase: (caseId: string) => boolean = () => false,
): CaseActions {
  // A case its raiser took back has nothing left to do on it.
  if (kase.withdrawn !== null) return NONE;
  const isManager = role === "manager";
  const raiser = me.userId !== null && kase.fromUserId === me.userId;
  const d = kase.decided;
  const actor = { role, name: "", handle: null, userId: me.userId, me };
  // On their own idea nobody takes part in its review, a manager included (D13): merging and linking are review actions too.
  const own = kase.review?.state === "pending" && isOwnIdea(actor, kase);
  const merge = !own && mayMerge(kase, ANY, me, isManager);
  const link = !own && mayLink(kase, ANY, me, isManager);
  const reviewing = mayReview(actor, kase, state);
  const step = caseApprovalView(kase, state, me).myStep;
  const onDesk = isManager || onDeskOf(kase, me);
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
    moveToDesk: mayMoveToDesk(actor, kase, state),
    // A pending review forwards a raise to a desk; the proposed route comes first (D13). The routes are the company's.
    forward: reviewing ? [...state.routes].sort((a, b) => Number(b.id === kase.routeId) - Number(a.id === kase.routeId)).map((r) => ({ id: r.id, type: r.type, owner: r.owner.name, proposed: r.id === kase.routeId })) : null,
    back: reviewing && kase.status === "open",
    no: reviewing && (kase.status === "open" || kase.status === "asked"),
    yes: onDesk && kase.open && kase.review?.state !== "pending" && kase.status !== "approval",
    cost: mayCost(actor, kase, state),
    answer: step,
    approve: step !== null,
    approveConditions: step !== null,
    sendBack: step !== null,
    refuse: step !== null,
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
