// The leader inbox's order and its one duplicate rule. Pure: rows in, rows out; InboxView renders them.
export type InboxSort = "urgent" | "newest" | "score";
export const INBOX_SORTS: readonly InboxSort[] = ["urgent", "newest", "score"];

export type InboxOrderRow = {
  due: number; // days left on the promise or the check-in; negative when late
  paused: boolean; // waiting on the raiser's answer, so the clock stands still
  sent: Date;
  score: number | null; // the case score; an idea owed a decision has none
};

/**
 * A case that became an idea which waits in the same inbox says the same thing twice: the idea row
 * stays, the case goes. `ideaIds` are the ideas shown.
 */
export function withoutLinkedCases<C extends { linkedIdea: string | null }>(cases: readonly C[], ideaIds: ReadonlySet<string>): C[] {
  return cases.filter((c) => c.linkedIdea === null || !ideaIds.has(c.linkedIdea));
}

// Most urgent first: the most days late on top, then the fewest days left. A paused row waits on
// someone else, so it goes last. Equal rows: the one that has waited longer.
const byUrgency = (a: InboxOrderRow, b: InboxOrderRow) =>
  Number(a.paused) - Number(b.paused) || a.due - b.due || a.sent.getTime() - b.sent.getTime();

/** A new list in the chosen order. Rows without a score come after the scored ones, most urgent first. */
export function sortInbox<R extends InboxOrderRow>(rows: readonly R[], sort: InboxSort): R[] {
  const list = rows.slice();
  if (sort === "newest") return list.sort((a, b) => b.sent.getTime() - a.sent.getTime() || byUrgency(a, b));
  if (sort === "score") return list.sort((a, b) => (b.score ?? -1) - (a.score ?? -1) || byUrgency(a, b));
  return list.sort(byUrgency);
}
