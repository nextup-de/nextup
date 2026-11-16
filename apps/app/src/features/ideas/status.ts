// Where an idea I raised stands, for the Mine list in the Ideas tab (components/ideas/MineView): one fact per idea, and the
// one sentence built from it at render. Pure: the reduced case and the company's seats and roles in, a fact out.
// Order: what ended it (withdrawn, merged, a yes or a no), then what waits on the raiser (sent back), then the approvals
// under way, the discussion, and last the desk it waits on.
import type { SeatRow } from "@/features/auth/identity";
import type { ReducedCase, State } from "@/features/cases/reducer";
import type { ClockSpec } from "@/features/clock";
import { currentStep, stepLabel } from "@/features/approvals/steps";
import type { ApprovalConfig, ApprovalRoleInfo } from "@/features/approvals/types";
import { deskLabel, openSince, type OpenSince, type RoleTitle } from "@/features/overview/rows";
import { projectLabel, projectOfCase } from "@/features/projects/selectors";
import type { ReducedProject } from "@/features/projects/types";
import type { T } from "@/i18n";

export type IdeaStatus =
  | { kind: "waiting"; on: string[]; role: string | null }
  | { kind: "discussion" }
  | { kind: "sentBack"; reason: string }
  | { kind: "approving"; approved: number; total: number; waitingOn: string[] }
  | { kind: "project"; projectId: string; label: string }
  | { kind: "approved" }
  | { kind: "no"; reason: string }
  | { kind: "withdrawn" }
  | { kind: "merged" };

/** What the status reads besides the case: the seats (who holds a desk), the roles' titles and the councils. */
export type StatusWorld = {
  seats: readonly SeatRow[];
  roles: readonly RoleTitle[];
  approvals: Pick<ApprovalConfig, "councils">;
};

/**
 * How far the approvals of an idea are, in the states of the approval flow's `ideaApprovalStatus` (features/approvals/status,
 * branch feat/parallel-approvals): its `waitingOn` people by name, and the reason of a send-back (`returned.reason` there).
 */
export type ApprovalProgress = {
  state: "none" | "pending" | "returned" | "approved" | "refused";
  approved: number; total: number; waitingOn: string[]; returnedReason: string;
};

type StatusCase = Pick<ReducedCase, "withdrawn" | "merged" | "decided" | "status" | "question" | "discussion" | "approvals" | "assigneeRoleId" | "escalated">;

const holdersOf = (seats: readonly SeatRow[], roleId: string | undefined): string[] =>
  [...new Set(seats.filter((s) => s.roleId === roleId && s.userId !== null).sort((a, b) => a.sort - b.sort).map((s) => s.label))];

/**
 * THE SEAM for the approval flow: the one place the Mine list learns how far an idea's approvals are.
 * TODO(approval-flow): once `ideaApprovalStatus` from features/approvals/status is on main, replace the body with
 *   const s = ideaApprovalStatus(c, state);
 *   return { state: s.state, approved: s.approved, total: s.total, waitingOn: s.waitingOn.map((a) => a.name), returnedReason: s.returned?.reason ?? "" };
 * (StatusCase then also picks "approvalRuns" | "openingRunId", and StatusWorld carries the state it reads.) Nothing else
 * in this file or in the Mine list changes. Until then it reads the active run as today's reducer keeps it: steps said yes
 * (or yes with conditions) of all steps, who holds the step that is due, and a send-back as that step's latest answer.
 */
export function approvalProgress(c: StatusCase, world: StatusWorld): ApprovalProgress | null {
  const run = c.approvals;
  if (run === null || run.steps.length === 0) return null;
  const step = currentStep(run);
  const last = step?.answers[step.answers.length - 1];
  const roles = world.roles.map((r): ApprovalRoleInfo => ({ id: r.id, title: r.title ?? "", reportsToId: null, spendLimitEur: null }));
  // The people who hold the role of the step that is due; a council, or a role nobody holds, by its name.
  const holders = step !== null && step.kind !== "council" ? holdersOf(world.seats, step.roleId).slice(0, 2) : [];
  const label = step === null ? "" : stepLabel(step, world.approvals, roles).name;
  const returned = last?.answer === "back";
  return {
    state: run.done ? (run.outcome === "no" ? "refused" : "approved") : returned ? "returned" : "pending",
    approved: run.steps.filter((s) => s.state === "yes" || s.state === "conditions").length,
    total: run.steps.length,
    waitingOn: holders.length ? holders : label ? [label] : [],
    returnedReason: returned ? (last?.reason ?? "").trim() : "",
  };
}

/** Where one idea I raised stands. `project`: the project a yes opened or joined (projectOfCase), null when none. */
export function ideaStatus(c: StatusCase, world: StatusWorld, project: Pick<ReducedProject, "id" | "number"> | null = null): IdeaStatus {
  if (c.withdrawn) return { kind: "withdrawn" };
  if (c.merged) return { kind: "merged" };
  const dec = c.decided;
  if (dec?.answer === "yes") return project ? { kind: "project", projectId: project.id, label: projectLabel(project) } : { kind: "approved" };
  if (dec?.answer === "no") return { kind: "no", reason: (dec.reason || dec.note).trim() };
  const approval = approvalProgress(c, world);
  if (approval?.state === "returned") return { kind: "sentBack", reason: approval.returnedReason };
  // A question to the raiser is the desk sending it back: they change it and answer, and it goes on.
  if (c.status === "asked" && c.question && !c.question.answer) return { kind: "sentBack", reason: c.question.text.trim() };
  if (approval?.state === "pending") return { kind: "approving", approved: approval.approved, total: approval.total, waitingOn: approval.waitingOn };
  if (c.status === "discussion") return { kind: "discussion" };
  const desk = deskLabel(c, world.seats, world.roles);
  return { kind: "waiting", on: desk.names, role: desk.role || null };
}

/** "Anna Weber", "Anna Weber and Ben Roth". */
const names = (t: T, xs: string[]) => (xs.length <= 1 ? xs.join("") : xs.slice(0, -1).join(", ") + " " + t("ideas.listAnd") + " " + xs[xs.length - 1]);

/** The status line, built at render. A project's line is the text of its link. */
export function ideaStatusText(s: IdeaStatus, t: T): string {
  switch (s.kind) {
    case "waiting": {
      const who = s.on.length ? names(t, s.on) : s.role;
      return who ? t("ideas.mineWaitingOn", { who }) : t("ideas.mineWaitingDesk");
    }
    case "discussion": return t("ideas.mineDiscussion");
    case "sentBack": return s.reason ? t("ideas.mineSentBack", { reason: s.reason }) : t("ideas.mineSentBackPlain");
    case "approving": {
      const done = t("ideas.mineApproved", { approved: s.approved, total: s.total });
      return s.waitingOn.length ? done + " · " + t("ideas.mineWaitingOnLower", { who: names(t, s.waitingOn) }) : done;
    }
    case "project": return t("ideas.mineBecame", { id: s.label });
    case "approved": return t("ideas.mineYes");
    case "no": return s.reason ? t("ideas.mineNo", { reason: s.reason }) : t("ideas.mineNoPlain");
    case "withdrawn": return t("ideas.mineWithdrawn");
    case "merged": return t("ideas.mineMerged");
  }
}

const ENDED: readonly IdeaStatus["kind"][] = ["project", "approved", "no", "withdrawn", "merged"];

export type MineIdea = { id: string; title: string; problem: boolean; since: OpenSince; running: boolean; status: IdeaStatus };

/** The ideas (and problems) this person raised, by user id: the running ones first, each newest first. */
export function mineIdeas(state: State, userId: string | null, world: StatusWorld, clock: ClockSpec): MineIdea[] {
  if (userId === null) return [];
  const rows = state.cases.filter((c) => c.fromUserId === userId).map((c) => {
    const status = ideaStatus(c, world, projectOfCase(state, c) ?? null);
    const running = !ENDED.includes(status.kind);
    return { row: { id: c.id, title: c.title, problem: c.kind === "problem", since: openSince(c, state.day, clock), running, status }, raisedDay: c.raisedDay };
  });
  return rows.sort((a, b) => Number(b.row.running) - Number(a.row.running) || b.raisedDay - a.raisedDay).map((x) => x.row);
}
