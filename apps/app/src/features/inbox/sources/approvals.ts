// Items from approvals (kind `approval`; plan GAT, D25): one item per case whose approval run waits on a step, for the people who may answer that step -
// the holders of the step's role (a council step: of the council's secretary role) and the seat a late hand-over named (D23) - and never for the person who
// said the yes (D22). Asked of them to confirm, due on the step's day: it turns late the working day after. The title is the case's, like every item the
// case page opens; the page says what is asked. A case on the review seat is an ordinary desk item from the cases source (no change). Derived from the
// reduced state, nothing stored; the right to answer is the one the server checks (features/approvals/rights.ts mayAnswerStep).
import { mayAnswerStep } from "@/features/approvals/rights";
import { currentStep } from "@/features/approvals/steps";
import type { Actor } from "@/features/cases/permissions";
import type { ApprovalStep } from "@/features/approvals/types";
import type { State } from "@/features/cases/reducer";
import type { Me } from "@/features/auth/identity";
import type { InboxInput, InboxItem } from "../types";

/** The role this person answers the step as: the step's role (a council's secretary role), else the role of the seat a late hand-over named. */
function answeringRole(step: ApprovalStep, me: Me, state: Pick<State, "seats" | "approvals">): string | null {
  const own = step.kind === "council" ? state.approvals.councils.find((c) => c.id === step.councilId)?.secretaryRoleId : step.roleId;
  if (own !== undefined && me.roleIds.includes(own)) return own;
  return state.seats.find((s) => s.id === step.seatId)?.roleId ?? null;
}

export function approvalItems(input: InboxInput): InboxItem[] {
  const { state, me } = input;
  if (me.userId === null) return [];
  // The right is the person's seats and roles; an app role gives no extra say in a step (mayAnswerStep).
  const actor: Actor = { role: "member", userId: me.userId, me, name: "", handle: null };
  const out: InboxItem[] = [];
  for (const c of state.cases) {
    const run = c.approvals ?? null; // a hand-built case of an old test may not carry the field
    const step = currentStep(run);
    if (run === null || step === null) continue;
    if (!mayAnswerStep(actor, c, state, { runId: run.runId, stepId: step.id, dueRev: step.dueRev })) continue;
    out.push({
      id: `approval:${step.id}`, ask: "confirm", kind: "approval", caseId: c.id, title: c.title, href: `/cases/${encodeURIComponent(c.id)}`,
      dueDay: step.dueDay, late: false, dueSoon: false, pinned: false, deskRoleId: answeringRole(step, me, state),
    });
  }
  return out;
}
