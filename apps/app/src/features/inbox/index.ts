// The one inbox (plan INB): every role's items in three asks and one order.
import { markDue, orderItems } from "./order";
import { caseItems, type InboxSourceInput } from "./sources/cases";
import { projectDraftItems } from "./sources/project-draft";
import { projectMoveItems } from "./sources/project-move";
import { projectItems } from "./sources/projects";
import type { InboxItem } from "./types";

export type { InboxAsk, InboxInput, InboxItem, InboxKind } from "./types";
export type { InboxSourceInput } from "./sources/cases";

/**
 * What is asked of this person, from the existing state (no new table): cases, projects, project drafts and stalled projects, each item
 * once, marked late or due soon, in the inbox's order. `role` is only read for what a manager alone is asked.
 */
export function inboxItems(input: InboxSourceInput): InboxItem[] {
  const all = [...caseItems(input), ...projectItems(input), ...projectDraftItems(input), ...projectMoveItems(input)];
  // A case that became an idea waiting in the same inbox says the same thing twice: the idea stays, the case goes.
  const ideaIds = new Set(all.filter((i) => i.kind === "idea").map((i) => i.id.slice("idea:".length)));
  const linked = new Set(input.state.cases.filter((c) => c.linkedIdea !== null && ideaIds.has(c.linkedIdea)).map((c) => c.id));
  const seen = new Set<string>();
  const items = all.filter((i) => {
    if (seen.has(i.id)) return false;
    seen.add(i.id);
    return i.caseId === undefined || !linked.has(i.caseId);
  });
  return orderItems(items.map((i) => markDue(i, input.today)), input.today);
}

/**
 * The counts of a list. They overlap (a late item to decide is in `decide` and in `late`): never add them to get the
 * badge total, use `total`. `waiting` counts what is for the person to do their part of, not what waits on others.
 */
export function inboxCounts(items: readonly InboxItem[]): { total: number; decide: number; late: number; waiting: number } {
  return {
    total: items.length,
    decide: items.filter((i) => i.ask === "decide").length,
    late: items.filter((i) => i.late).length,
    waiting: items.filter((i) => i.ask === "part").length,
  };
}
