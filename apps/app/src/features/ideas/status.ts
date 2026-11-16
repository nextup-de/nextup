// Where an idea I raised stands, for the Mine list in the Ideas tab (components/ideas/MineView): one fact per idea, and the
// one sentence built from it at render. Pure: the reduced case and the company's seats and roles in, a fact out.
// Order: what ended it (withdrawn, merged, a yes or a no), then what waits on the raiser (sent back), then the approvals
// under way, the discussion, and last the desk it waits on.
import type { SeatRow } from "@/features/auth/identity";
import type { ReducedCase, State } from "@/features/cases/reducer";
import type { ClockSpec } from "@/features/clock";
import { ideaApprovalStatus } from "@/features/approvals/status";
import { currentStep } from "@/features/approvals/steps";
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

/** What the status reads besides the case: the seats (who holds a desk), the roles' titles and the company's approval settings. */
export type StatusWorld = {
  seats: readonly SeatRow[];
  roles: readonly RoleTitle[];
  approvals: State["approvals"];
};

/**
 * How far the approvals of an idea are, in the states of the approval flow's `ideaApprovalStatus` (features/approvals/status):
 * its `waitingOn` people by name, and the reason of a send-back (`returned.reason` there).
 */
export type ApprovalProgress = {
  state: "none" | "pending" | "returned" | "approved" | "refused";
  approved: number; total: number; waitingOn: string[]; returnedReason: string;
};

type StatusCase = Pick<ReducedCase, "withdrawn" | "merged" | "decided" | "status" | "question" | "discussion" | "approvals" | "approvalRuns" | "openingRunId" | "assigneeRoleId" | "escalated">;

const holdersOf = (seats: readonly SeatRow[], roleId: string | undefined): string[] =>
  [...new Set(seats.filter((s) => s.roleId === roleId && s.userId !== null).sort((a, b) => a.sort - b.sort).map((s) => s.label))];

/**
 * The one place the Mine list learns how far an idea's approvals are: the approval flow's `ideaApprovalStatus` (decisions A to
 * D, 16 Nov 2026). A named approver is waited on by name; an old run's step by the people who hold its role, else by the role's
 * or council's name. An old sequential run sends an idea back with a "back" answer on the step that is due; the parallel flow
 * with a no (`returned`).
 */
export function approvalProgress(c: StatusCase, world: StatusWorld): ApprovalProgress | null {
  const s = ideaApprovalStatus(c, { seats: [...world.seats], approvals: world.approvals });
  if (s.state === "none" || s.total === 0) return null;
  const steps = c.approvals?.steps ?? [];
  const due = c.approvals === null ? null : currentStep(c.approvals);
  // An old sequential run waits on the step that is due only; the parallel flow on every pending approver.
  const pending = s.parallel ? s.waitingOn : s.waitingOn.filter((a) => a.stepId === due?.id);
  const waitingOn = pending.flatMap((a): string[] => {
    if (a.userId !== null) return a.name ? [a.name] : [];
    const step = steps.find((x) => x.id === a.stepId);
    const holders = step !== undefined && step.kind !== "council" ? holdersOf(world.seats, step.roleId).slice(0, 2) : [];
    return holders.length ? holders : a.name ? [a.name] : [];
  });
  const last = due?.answers[due.answers.length - 1];
  const oldBack = !s.parallel && s.state === "pending" && last?.answer === "back";
  return {
    state: oldBack ? "returned" : s.state,
    approved: s.approved,
    total: s.total,
    waitingOn,
    returnedReason: (s.returned?.reason ?? (oldBack ? last?.reason ?? "" : "")).trim(),
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
      // No zero is shown (DESIGN_RULES 2): before the first yes the line is who it waits on alone.
      if (s.approved === 0 && s.waitingOn.length) return t("ideas.mineWaitingOn", { who: names(t, s.waitingOn) });
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
