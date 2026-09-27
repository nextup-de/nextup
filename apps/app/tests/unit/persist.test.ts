// Rows <-> EventLog. Pure, no database - this is the mapping the whole server-backed log rests on.
import { describe, expect, it } from "vitest";
import { cursorOf, isAppEventType, logFromRows, type EventRow } from "@/features/cases/persist";
import { reduce } from "@/features/cases/reducer";
import { SEED } from "@/features/demo/seed";

const row = (over: Partial<EventRow> & Pick<EventRow, "id" | "seq">): EventRow => ({
  day: 0,
  ts: new Date("2026-09-21T10:00:00Z"),
  type: "case.read",
  actor: "T. Vogel",
  targetId: "c1",
  payload: {},
  ...over,
});

describe("logFromRows", () => {
  it("carries the company clock, which the reducer reads directly", () => {
    // reducer.ts does `const day = log.day | 0` and never replays day.advanced, so this cannot
    // be derived from the rows - it comes from Company.demoDay.
    expect(logFromRows([], 7).day).toBe(7);
    expect(logFromRows([], 0).day).toBe(0);
  });

  it("keeps the order it was given", () => {
    const log = logFromRows([row({ id: "e1", seq: 1 }), row({ id: "e2", seq: 2 }), row({ id: "e3", seq: 3 })], 0);
    expect(log.events.map((e) => e.id)).toEqual(["e1", "e2", "e3"]);
  });

  it("never marks a row as seed history", () => {
    // Seed events live in Company.seedJson and are synthesised by the reducer. A row in the
    // table is always something that actually happened.
    expect(logFromRows([row({ id: "e1", seq: 1 })], 0).events[0].seed).toBeUndefined();
  });

  it("normalises a Date or a number into the ts the reducer expects", () => {
    const asDate = logFromRows([row({ id: "e1", seq: 1, ts: new Date(1_700_000_000_000) })], 0);
    const asNum = logFromRows([row({ id: "e2", seq: 2, ts: 1_700_000_000_000 })], 0);
    expect(asDate.events[0].ts).toBe(1_700_000_000_000);
    expect(asNum.events[0].ts).toBe(1_700_000_000_000);
  });

  it("tolerates a null payload", () => {
    expect(logFromRows([row({ id: "e1", seq: 1, payload: null })], 0).events[0].payload).toEqual({});
  });

  it("produces a log the reducer actually accepts", () => {
    const log = logFromRows(
      [
        row({ id: "e1", seq: 1, type: "case.raised", targetId: "c_new", payload: { title: "Line 3 jams", assignee: "T. Vogel", routeId: "r1", from: "J. Schmidt" } }),
        row({ id: "e2", seq: 2, type: "case.read", targetId: "c_new" }),
      ],
      0,
    );
    const state = reduce(SEED, log);
    const raised = state.cases.find((c) => c.id === "c_new");
    expect(raised?.title).toBe("Line 3 jams");
    expect(raised?.read).toBe(0);
  });
});

describe("cursorOf", () => {
  it("returns the highest seq seen", () => {
    expect(cursorOf([row({ id: "a", seq: 4 }), row({ id: "b", seq: 9 })], 0)).toBe(9);
  });
  it("holds the cursor still when nothing came back", () => {
    expect(cursorOf([], 12)).toBe(12);
  });
});

describe("isAppEventType", () => {
  it("accepts what the UI emits", () => {
    for (const t of ["case.raised", "case.decided", "idea.cosigned", "day.advanced"]) {
      expect(isAppEventType(t)).toBe(true);
    }
  });

  it("rejects seed-history-only types", () => {
    // These only ever appear inside Company.seedJson, describing what happened before day 0.
    expect(isAppEventType("case.building")).toBe(false);
    expect(isAppEventType("case.shipped")).toBe(false);
  });

  it("rejects nonsense", () => {
    expect(isAppEventType("case.deleted")).toBe(false);
    expect(isAppEventType("")).toBe(false);
  });
});
