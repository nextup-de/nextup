// Board column <-> Jira status. Jira workflows differ per project, so the sync works by status
// category (new / indeterminate / done) unless the admin pinned a column to a status id
// (settings.statusFor). Blocked has no twin and stands for "in progress". Pure.
import type { StepColumn } from "@/features/projects/types";
import { CATEGORY_FOR, type JiraCategory, type JiraSettings, type JiraStatus, type JiraTransition } from "./types";

type Mapping = Pick<JiraSettings, "statusFor">;

const COLUMN_OF: Record<JiraCategory, StepColumn> = { new: "todo", indeterminate: "doing", done: "done" };

/** Is this Jira status where the column wants the issue to be? (Compare before acting.) */
export function sameState(column: StepColumn, status: JiraStatus, m: Mapping): boolean {
  const pinned = m.statusFor?.[column];
  return pinned ? status.id === pinned : CATEGORY_FOR[column] === status.statusCategory.key;
}

/** The column an issue in this status belongs on. `current` is kept when it already fits (a Blocked card stays Blocked). */
export function columnFor(status: JiraStatus, m: Mapping, current: StepColumn): StepColumn {
  const pinned = Object.entries(m.statusFor ?? {}).filter(([, id]) => id === status.id).map(([column]) => column as StepColumn);
  if (pinned.length) return pinned.includes(current) ? current : pinned[0];
  if (sameState(current, status, m)) return current;
  return COLUMN_OF[status.statusCategory.key] ?? "todo";
}

/** One move to make: `final` is false when it only gets the issue closer (the workflow has no direct way). */
export type Hop = { transition: JiraTransition; final: boolean };

/**
 * The transition that moves an issue (now in `current`) towards the column. A pinned status wins,
 * then any transition into the column's category. Without one - a workflow that cannot go from To
 * Do straight to Done - a step through In Progress comes first, and the caller asks again. null =
 * no way to get there from here.
 */
export function pickTransition(transitions: readonly JiraTransition[], to: StepColumn, m: Mapping, current: JiraStatus): Hop | null {
  const pinned = m.statusFor?.[to];
  if (pinned) {
    const t = transitions.find((x) => x.to.id === pinned);
    return t ? { transition: t, final: true } : null;
  }
  const want = CATEGORY_FOR[to];
  const direct = transitions.find((x) => x.to.statusCategory.key === want && x.to.id !== current.id);
  if (direct) return { transition: direct, final: true };
  if (want !== "indeterminate") {
    const via = transitions.find((x) => x.to.statusCategory.key === "indeterminate" && x.to.id !== current.id);
    if (via) return { transition: via, final: false };
  }
  return null;
}
