// The one inbox (plan INB). INB-A1 fills `inboxItems`.
import type { InboxInput, InboxItem } from "./types";

export type { InboxAsk, InboxInput, InboxItem, InboxKind } from "./types";

export function inboxItems(input: InboxInput): InboxItem[] {
  void input;
  return [];
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
