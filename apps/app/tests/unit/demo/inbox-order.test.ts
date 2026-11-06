// The leader inbox: the three sort orders and the one duplicate rule (components/dashboard/inbox-order).
import { describe, expect, it } from "vitest";
import { sortInbox, withoutLinkedCases, type InboxOrderRow } from "@/components/dashboard/inbox-order";
import { meFor } from "@/features/auth/identity";
import { invitedTo } from "@/features/cases/discussion";
import { emptyLog } from "@/features/cases/events";
import { reduce } from "@/features/cases/reducer";
import { EMPTY_SEED } from "@/features/demo";
import { withSampleData } from "@/features/demo/sample-data";

type Row = InboxOrderRow & { id: string };
const day = (n: number) => new Date(2026, 10, n, 12);
const row = (id: string, due: number, sentDay: number, more: Partial<Row> = {}): Row => ({ id, due, paused: false, sent: day(sentDay), score: null, ...more });
const ids = (rows: readonly Row[]) => rows.map((r) => r.id);

describe("inbox order", () => {
  const rows = [
    row("two-left", 2, 3, { score: 60 }),
    row("paused-late", -4, 1, { paused: true, score: 91 }),
    row("late-1", -1, 2, { score: 70 }),
    row("idea", 1, 4),
    row("late-3", -3, 1, { score: 85 }),
    row("five-left", 5, 6, { score: 50 }),
  ];

  it("most urgent first: the most days late, then the fewest days left, a paused row last", () => {
    expect(ids(sortInbox(rows, "urgent"))).toEqual(["late-3", "late-1", "idea", "two-left", "five-left", "paused-late"]);
  });

  it("equal days left: the one that has waited longer comes first", () => {
    expect(ids(sortInbox([row("younger", 2, 5), row("older", 2, 3)], "urgent"))).toEqual(["older", "younger"]);
  });

  it("newest first goes by when it was sent", () => {
    expect(ids(sortInbox(rows, "newest"))).toEqual(["five-left", "idea", "two-left", "late-1", "late-3", "paused-late"]);
  });

  it("highest score first, and a row without a score after every scored one", () => {
    expect(ids(sortInbox(rows, "score"))).toEqual(["paused-late", "late-3", "late-1", "two-left", "five-left", "idea"]);
  });

  it("rows without a score keep the urgent order among themselves, and so do equal scores", () => {
    const list = [row("idea-fresh", 4, 5), row("b", 1, 2, { score: 70 }), row("idea-late", -2, 1), row("a", -1, 1, { score: 70 })];
    expect(ids(sortInbox(list, "score"))).toEqual(["a", "b", "idea-late", "idea-fresh"]);
  });

  it("returns a new list and leaves the rows as they were", () => {
    const before = ids(rows);
    sortInbox(rows, "urgent");
    expect(ids(rows)).toEqual(before);
  });
});

describe("a case and the idea it became", () => {
  it("drops the case whose idea is among the idea rows, and no other", () => {
    const cases = [{ id: "c1", linkedIdea: null }, { id: "c2", linkedIdea: "i1" }, { id: "c3", linkedIdea: "i9" }];
    expect(withoutLinkedCases(cases, new Set(["i1", "i2"])).map((c) => c.id)).toEqual(["c1", "c3"]);
    expect(withoutLinkedCases(cases, new Set()).map((c) => c.id)).toEqual(["c1", "c2", "c3"]);
  });

  it("the manager's sample inbox shows the Tier-1 line-stop alerts once, as the idea", () => {
    const seed = withSampleData(EMPTY_SEED, { userId: "u_manager", name: "R. Tester", handle: null, role: "manager" }, 0);
    const S = reduce(seed, emptyLog());
    const me = meFor("u_manager", seed.seats);
    const ideas = S.ideas.filter((i) => i.status === "Awaiting decision"); // what decisionsWaiting lists for a manager
    const asked = S.cases.filter((c) => invitedTo(c, me));
    expect(ideas.map((i) => i.id)).toContain("sample-i1");
    expect(asked.map((c) => c.id)).toContain("sample-c7"); // the case the idea came from: asked for the manager's view
    const kept = withoutLinkedCases(asked, new Set(ideas.map((i) => i.id)));
    expect(kept.map((c) => c.id)).not.toContain("sample-c7");
    // A leader decides no ideas, so there is no idea row and the case stays.
    expect(withoutLinkedCases(asked, new Set()).map((c) => c.id)).toContain("sample-c7");
  });
});
