// The order of the one inbox (plan INB, decision D4). Pure: items in, items out.
import type { InboxItem } from "./types";

/** Is `dueDay` exactly one working day after `today`? The state's days are working-day numbers in workdays mode (a weekend or holiday has no number of its own), plain days in the demo, so one apart is one working day. */
export type WorkdayGap = (today: number, dueDay: number) => boolean;

export const oneWorkdayAway: WorkdayGap = (today, dueDay) => dueDay - today === 1;

/** The item with `late` (due day before today) and `dueSoon` (one working day left) set from its due day. No due day: neither. */
export function markDue(item: InboxItem, today: number, isWorkdayGap: WorkdayGap = oneWorkdayAway): InboxItem {
  const due = item.dueDay;
  return { ...item, late: due !== null && due < today, dueSoon: due !== null && isWorkdayGap(today, due) };
}

// 0 pinned, 1 late, 2 due soon, 3 the rest. Judged from the due day, not from the flags, so a hand-built item sorts the same.
function bucket(item: InboxItem, today: number, isWorkdayGap: WorkdayGap): number {
  if (item.pinned) return 0;
  if (item.dueDay === null) return 3;
  if (item.dueDay < today) return 1;
  return isWorkdayGap(today, item.dueDay) ? 2 : 3;
}

/**
 * Pinned first, then late, then due soon, then the rest; inside each bucket by due day (none last), then oldest first.
 * "Oldest first" is the order the items come in: the sources list them oldest first and the sort is stable.
 * A new list; the items are not changed.
 */
export function orderItems(items: readonly InboxItem[], today: number, isWorkdayGap: WorkdayGap = oneWorkdayAway): InboxItem[] {
  return items
    .map((item, at) => ({ item, at, b: bucket(item, today, isWorkdayGap) }))
    .sort((x, y) => x.b - y.b || (x.item.dueDay ?? Infinity) - (y.item.dueDay ?? Infinity) || x.at - y.at)
    .map((x) => x.item);
}
