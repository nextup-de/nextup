// The Feed's pure parts: the stage pill, the cover's number and line, the supporters line, the sorts.
import { describe, expect, it } from "vitest";
import { appendEvent, emptyLog } from "@/features/cases/events";
import { deptChips, feedCover, feedStage, inDept, shortHook, shortStat, sortFeed, supportLine } from "@/features/cases/feed";
import { reduce, type ReduceSeed } from "@/features/cases/reducer";
import { CASES, IDEAS, PROBLEMS, PROMISE_DAYS, ROUTES } from "@/features/demo/seed";

const SEED: ReduceSeed = { cases: CASES, ideas: IDEAS, problems: PROBLEMS, routes: ROUTES, promiseDays: PROMISE_DAYS };
const base = { shipped: null, building: null, decided: null, status: "open" as const, read: null };

describe("feedStage", () => {
  it("new until someone reads it, then under review", () => {
    expect(feedStage(base)).toEqual({ label: "New", tone: "new" });
    expect(feedStage({ ...base, read: 3 })).toEqual({ label: "Under review", tone: "review" });
  });
  it("a question out, a decision, building and shipped each get their own pill", () => {
    expect(feedStage({ ...base, status: "asked" }).label).toBe("Needs info");
    expect(feedStage({ ...base, decided: { answer: "yes", reason: "", note: "", by: "M. Roth", day: 2 } })).toEqual({ label: "Approved", tone: "approved" });
    expect(feedStage({ ...base, decided: { answer: "no", reason: "", note: "", by: "M. Roth", day: 2 } }).label).toBe("Not now");
    const c = reduce(SEED, emptyLog()).cases.find((x) => x.shipped);
    if (c) expect(feedStage(c).label).toBe("Shipped");
  });
  it("follows the event log: a decision moves the pill", () => {
    const id = CASES[0].id;
    const log = appendEvent(emptyLog(), { type: "case.decided", actor: "T. Vogel", target: id, payload: { answer: "yes" } });
    expect(feedStage(reduce(SEED, log).cases.find((x) => x.id === id)!).label).toBe("Approved");
  });
});

describe("feedCover", () => {
  it("takes the first amount from what the raiser said it is worth, the rest as the line", () => {
    expect(feedCover({ upside: "€4k a month on boxes", age: 2, open: true }, 0)).toEqual({ stat: "€4k", hook: "a month on boxes" });
    expect(feedCover({ upside: "About 25 min idle every morning", age: 2, open: true }, 0)).toEqual({ stat: "25 min", hook: "idle every morning" });
    expect(feedCover({ upside: "Under 20 minutes every changeover", age: 2, open: true }, 0)).toEqual({ stat: "20 min", hook: "every changeover" });
    expect(feedCover({ upside: "Saves €4k", age: 2, open: true }, 0)).toEqual({ stat: "€4k", hook: "saves" });
    expect(feedCover({ upside: "≈20 min per changeover", age: 2, open: true }, 0)).toEqual({ stat: "20 min", hook: "per changeover" });
  });
  it("never invents a number: without one it shows the backers, then the days open", () => {
    expect(feedCover({ upside: "Less waste", age: 4, open: true }, 3)).toEqual({ stat: "3", hook: "say it affects them" });
    expect(feedCover({ upside: "", age: 1, open: true }, 0)).toEqual({ stat: "1 d", hook: "waiting for an answer" });
    expect(feedCover({ upside: "", age: 9, open: false }, 1).stat).toBe("9 d");
  });
  it("the number is at most 7 characters, the line 2-4 words and 24 characters", () => {
    expect(feedCover({ upside: "€1,234,567,890 a year", age: 3, open: true }, 0).stat).toBe("3 d");
    expect(shortStat("5 weeks")).toBe("5 weeks");
    expect(shortStat("12 minutes")).toBe("12 min");
    expect(shortStat("120 hours")).toBe("120 h");
    const h = feedCover({ upside: "€4k a month on cardboard boxes we already have", age: 2, open: true }, 0).hook;
    expect(h).toBe("a month on cardboard");
    expect(h.length).toBeLessThanOrEqual(24);
    expect(shortHook("one two three four five")).toBe("one two three four");
    expect(shortHook("of paid waiting per hire")).toBe("of paid waiting");
    expect(shortHook("every changeover under the old plan")).toBe("every changeover");
  });
});

describe("supportLine", () => {
  it("names first, the rest as a count; you first when you back it", () => {
    const b = (name: string, userId: string | null = "u_" + name) => ({ name, userId });
    const me = { userId: "u_SD", seatIds: [], roleIds: [] };
    expect(supportLine([], me)).toBe("Nobody backs this yet");
    expect(supportLine([b("Tom")], me)).toBe("Tom backs this");
    expect(supportLine([b("SD")], me)).toBe("You back this");
    expect(supportLine([b("Tom"), b("Lena")], me)).toBe("Tom and Lena");
    expect(supportLine([b("Tom"), b("SD"), b("Lena"), b("Ana")], me)).toBe("You, Tom and 2 others");
    expect(supportLine([b("Tom"), b("Lena"), b("Ana")], me)).toBe("Tom, Lena and 1 other");
    // the same label under another id is somebody else
    expect(supportLine([b("SD", "u_other")], me)).toBe("SD backs this");
  });
});

describe("filters and sorts", () => {
  it("a department chip matches the raising department or a named affected one", () => {
    expect(inDept(["Logistics", "Procurement"], "Procurement")).toBe(true);
    expect(inDept(["Logistics"], "HR")).toBe(false);
    expect(inDept([], "All")).toBe(true);
  });
  it("most supported first (ties: comments, then longest waiting); latest activity first the other way round", () => {
    const list = [{ id: "a", backers: 2, raisedDay: 1, comments: 0, lastDay: 1 }, { id: "b", backers: 5, raisedDay: 0, comments: 0, lastDay: 0 }, { id: "c", backers: 2, raisedDay: 4, comments: 0, lastDay: 4 }];
    expect(sortFeed(list, "support").map((x) => x.id)).toEqual(["b", "a", "c"]);
    expect(sortFeed(list, "latest").map((x) => x.id)).toEqual(["c", "a", "b"]);
    const quiet = [{ id: "old", backers: 0, raisedDay: 1, comments: 0, lastDay: 1 }, { id: "new", backers: 0, raisedDay: 9, comments: 0, lastDay: 9 }, { id: "talked", backers: 0, raisedDay: 5, comments: 2, lastDay: 7 }];
    expect(sortFeed(quiet, "support").map((x) => x.id)).toEqual(["talked", "old", "new"]);
    expect(sortFeed(quiet, "latest").map((x) => x.id)).toEqual(["new", "talked", "old"]);
  });

  it("puts what matters now first under Most relevant: support fades with quiet weeks, the reader's unit weighs more", () => {
    const list = [
      { id: "oldHit", backers: 6, raisedDay: 1, comments: 2, lastDay: 1 }, // 8 points, 8 weeks quiet
      { id: "fresh", backers: 2, raisedDay: 55, comments: 0, lastDay: 57 },
      { id: "mine", backers: 1, raisedDay: 50, comments: 0, lastDay: 56, own: true },
    ];
    expect(sortFeed(list, "relevant", 57).map((x) => x.id)).toEqual(["fresh", "mine", "oldHit"]);
    expect(sortFeed(list, "support", 57).map((x) => x.id)).toEqual(["oldHit", "fresh", "mine"]);
  });
});

describe("deptChips", () => {
  // Two sites with the same departments under each, as a multi-site tenant has them.
  const u = (id: string, name: string, parentId: string | null = null) => ({ id, name, people: 5, parentId });
  const seed = { depts: [u("n", "Werk Nord"), u("s", "Werk Süd"), u("n1", "Produktion", "n"), u("n2", "Qualität", "n"), u("n3", "Logistik", "n"), u("s1", "Produktion", "s"), u("s2", "IT", "s"), u("s3", "Einkauf", "s")] };
  const counts: Record<string, number> = { Produktion: 9, Qualität: 7, Logistik: 5, IT: 7, Einkauf: 0 };
  const countOf = (n: string) => counts[n] ?? 0;

  it("each department once, no sites, the busiest three as chips and the rest behind More", () => {
    expect(deptChips(seed, countOf, "All")).toEqual({ chips: ["Produktion", "Qualität", "IT"], more: ["Logistik", "Einkauf"] });
  });
  it("a department picked from More takes the last chip, so there are never more than three", () => {
    expect(deptChips(seed, countOf, "Einkauf")).toEqual({ chips: ["Produktion", "Qualität", "Einkauf"], more: ["IT", "Logistik"] });
  });
  it("a flat tenant (no sites with children) keeps every unit as a department", () => {
    const flat = { depts: [u("a", "Sales"), u("b", "Ops")] };
    expect(deptChips(flat, () => 1, "All")).toEqual({ chips: ["Sales", "Ops"], more: [] });
  });
});
