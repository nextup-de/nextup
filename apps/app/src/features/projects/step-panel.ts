import type { EventPayload } from "@/features/cases/events";
import { STEP_COLUMNS, type ReducedProject, type Step, type StepChecklistOp, type StepWaitingOnInput } from "./types";
import type { JiraRow } from "./views";

/** Jira follows NextUp's columns; its workflow is resolved by the connector. */
export function statusOptions(p: ReducedProject, step: Step, jira: JiraRow) {
  return p.steps.some((s) => s.id === step.id) ? STEP_COLUMNS.map((column) => ({
    column, current: column === step.column, requiresReason: column === "blocked",
    jiraFollows: jira.state === "synced",
  })) : [];
}

export function blockedValid(input: { why: string; waitingOn: StepWaitingOnInput; companyUserIds: readonly string[] }): boolean {
  const { why, waitingOn: w, companyUserIds } = input;
  if (!why.trim() || why.trim().length > 400) return false;
  if (w.kind === "nobody") return true;
  if (w.kind === "person") return !!w.userId && companyUserIds.includes(w.userId);
  return w.kind === "outside" && !!w.name?.trim() && w.name.trim().length <= 80;
}

export type CheckPress = { op: StepChecklistOp; itemId: string; text?: string; done?: boolean };

/** A press names one item, never a snapshot of the checklist. */
export function checkEvent(step: Step, press: CheckPress): { type: "project.step.checklist"; payload: EventPayload } | null {
  const item = step.checklist.find((x) => x.id === press.itemId);
  if (!press.itemId.trim()) return null;
  if (press.op === "add" ? !!item || step.checklist.length >= 30 : !item) return null;
  const payload: EventPayload = { stepId: step.id, op: press.op, itemId: press.itemId };
  if (press.op === "add" || press.op === "edit") {
    const text = press.text?.trim();
    if (!text || text.length > 200) return null;
    payload.text = text;
  } else if (press.op === "toggle") payload.done = press.done ?? !item!.done;
  return { type: "project.step.checklist", payload };
}

export type CommentThread = Step["comments"][number] & { replies: CommentThread[] };

/** The reducer keeps event order, so a reply can only attach to an earlier comment. */
export function commentThreads(step: Step): CommentThread[] {
  const roots: CommentThread[] = [];
  const seen = new Map<string, CommentThread>();
  for (const comment of step.comments) {
    const node: CommentThread = { ...comment, replies: [] };
    const parent = comment.replyTo ? seen.get(comment.replyTo) : undefined;
    (parent?.replies ?? roots).push(node);
    seen.set(comment.id, node);
  }
  return roots;
}

export function menuItems(p: ReducedProject, step: Step, _jira: JiraRow, rights: { removeStep: (s: Step) => boolean }): ("copyLink" | "remove")[] {
  if (!p.steps.some((s) => s.id === step.id)) return [];
  // Steps have removal, but no separate archive event. Older Done is a view filter (D7).
  return rights.removeStep(step) ? ["copyLink", "remove"] : ["copyLink"];
}
