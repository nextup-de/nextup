// Items from approvals (kind `approval`; plan GAT, D25): one item per case whose approval run waits on a step, for the people who may answer that step -
// the holders of the step's role (a council step: of the council's secretary role) and the seat a late hand-over named (D23) - and never for the person who
// said the yes (D22). Asked of them to confirm, due on the step's day: it turns late the working day after. The title is the case's, like every item the
// case page opens; the page says what is asked. A case on the review seat is an ordinary desk item from the cases source (no change). Derived from the
// reduced state, nothing stored; the right to answer is the one the server checks (features/approvals/rights.ts mayAnswerStep).
// A parallel run (decisions A to D, 16 Nov 2026) gives each named approver an item of their own at once, due the day of their one reminder; an idea one no
// returned waits in its raiser's inbox (a `part` item) until they send it again or withdraw it.
import { mayAnswerStep, mayResendApproval } from "@/features/approvals/rights";
import { openSteps, returnedRun } from "@/features/approvals/steps";
import type { Actor } from "@/features/cases/permissions";
import type { ApprovalStep } from "@/features/approvals/types";
import type { State } from "@/features/cases/reducer";
import type { Me } from "@/features/auth/identity";
import type { InboxInput, InboxItem } from "../types";
import { ideaPath } from "@/features/ideas/page-path";

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
    const href = ideaPath(c.id);
    if (run === null) {
      // Returned to its raiser (decision B): their move, to change it and send it again.
      const back = c.approvalRuns ? returnedRun(c) : null;
      if (back !== null && mayResendApproval(actor, c)) {
        out.push({ id: `approval-back:${back.runId}`, ask: "part", kind: "approval", caseId: c.id, title: c.title, href, dueDay: null, late: false, dueSoon: false, pinned: false, deskRoleId: null });
      }
      continue;
    }
    const step = openSteps(run).find((s) => mayAnswerStep(actor, c, state, { runId: run.runId, stepId: s.id, dueRev: s.dueRev }));
    if (step === undefined) continue;
    out.push({
      id: `approval:${step.id}`, ask: "confirm", kind: "approval", caseId: c.id, title: c.title, href,
      dueDay: step.dueDay, late: false, dueSoon: false, pinned: false, deskRoleId: step.userId !== undefined ? null : answeringRole(step, me, state),
    });
  }
  return out;
}
