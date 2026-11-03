import { describe, expect, it } from "vitest";
import { DEFAULT_CALENDAR, DEMO_CLOCK, type ClockSpec } from "@/features/clock";
import { dateOfWorkday, workdayOf } from "@/features/clock/calendar";
import { appendEvent, emptyLog } from "@/features/cases/events";
import { reduce } from "@/features/cases/reducer";
import { LOCAL_SEED } from "@/features/demo";
import { ledgerInputFromState } from "@/features/metrics/from-state";
import { hiddenTiles, periodRange, scopeCases, waitLedger } from "@/features/metrics/ledger";
import type { Baseline, LedgerCase, LedgerInput, Tile, TileId } from "@/features/metrics/types";

const base = (over: Partial<LedgerCase>): LedgerCase => ({
  caseId: "c", kind: "problem", status: "open", open: false, unitId: null, roleId: null, raisedDay: 80,
  firstResponseDay: null, firstReasonedAnswerDay: null, decidedDay: null, decision: null, withProject: false, reasoned: false,
  dueDay: 85, lastDay: 80, escalatedDay: null, raiserKey: null, raiserUnitId: null, ...over,
});

const facts = (rate: number | null) => ({
  answers: { yes: 3, yesProject: 2, question: 4, handed: 1, no: 5 },
  override: { proposed: 10, overridden: rate === null ? 0 : rate * 10, rate },
});

const g = base({ caseId: "g", raisedDay: 60, firstResponseDay: 62, firstReasonedAnswerDay: 62, escalatedDay: 75, dueDay: 65, lastDay: 62 });
const cases: LedgerCase[] = [
  base({ caseId: "a", kind: "idea", raisedDay: 80, firstResponseDay: 82, firstReasonedAnswerDay: 82, decidedDay: 82, decision: "yes", withProject: true, lastDay: 82 }),
  base({ caseId: "b", kind: "idea", raisedDay: 80, firstResponseDay: 88, firstReasonedAnswerDay: 90, decidedDay: 90, decision: "yes", lastDay: 90 }),
  base({ caseId: "c", open: true, raisedDay: 85, firstResponseDay: 86, firstReasonedAnswerDay: 86, dueDay: 90, lastDay: 86 }),
  base({ caseId: "d", open: true, raisedDay: 90, dueDay: 95, lastDay: 90, escalatedDay: 96 }), // open and late
  base({ caseId: "e", open: true, raisedDay: 98, dueDay: 103, lastDay: 98 }), // open and fresh: excluded
  base({ caseId: "f", open: true, status: "discussion", raisedDay: 95, dueDay: 100, lastDay: 99 }), // handed over only: no response
  g,
];
const input: LedgerInput = { cases, facts: facts(0.3), org: { units: [], roles: [] }, promiseDays: 5, today: 100, demoClock: true };
const period = { from: 71, to: 100 };
const tile = (tiles: Tile[], id: TileId) => tiles.find((t) => t.id === id)!;

describe("MET wait ledger", () => {
  const out = waitLedger(input, period, null, {});

  it("gives the six tiles with their values", () => {
    expect(out.tiles.map((t) => t.id)).toEqual(["firstReasonedAnswer", "onTime", "ideaToDecision", "pastPromise", "escalated", "overruled"]);
    expect(tile(out.tiles, "firstReasonedAnswer")).toMatchObject({ value: 2, of: 3 }); // waits 2, 10, 1
    expect(out.caseCount).toBe(6);
  });

  it("counts on time from first responses, one open late and one open fresh", () => {
    // a 2d ok, b 8d late, c 1d ok, d open past promise (late), e open within promise (left out), f handed over (no response, within promise)
    expect(tile(out.tiles, "onTime")).toMatchObject({ value: 50, of: 4 });
  });

  it("takes the idea-to-decision median over ideas decided in the period", () => {
    expect(tile(out.tiles, "ideaToDecision")).toMatchObject({ value: 6, of: 2 });
  });

  it("counts past-promise only for a period that ends today", () => {
    expect(tile(out.tiles, "pastPromise")).toMatchObject({ value: 2, of: 4 }); // c and d of the four open cases
    const earlier = waitLedger(input, { from: 41, to: 70 }, null, {});
    expect(tile(earlier.tiles, "pastPromise")).toMatchObject({ value: null, of: null });
  });

  it("counts escalations in the period and overruled from the facts", () => {
    expect(tile(out.tiles, "escalated").value).toBe(2); // d on 96, g on 75
    expect(tile(out.tiles, "overruled")).toMatchObject({ value: 30, of: 10 });
    expect(tile(waitLedger({ ...input, facts: facts(null) }, period, null, {}).tiles, "overruled").value).toBeNull();
  });

  it("gives six trend months and marks the baseline ones", () => {
    const b = { period: { from: 41, to: 70 }, input: { ...input, cases: [g], facts: facts(0.5) } };
    const withBase = waitLedger(input, period, b, {});
    expect(withBase.trend).toHaveLength(6);
    expect(withBase.trend.map((m) => m.baseline)).toEqual([false, false, false, false, true, false]);
    expect(withBase.trend[5]).toMatchObject({ month: "71", raised: 6, answered: 3, onTime: 2 }); // f's hand-over is no answer
    expect(withBase.trend[4]).toMatchObject({ raised: 1, answered: 1, onTime: 1 });
    expect(tile(withBase.tiles, "pastPromise").months[5]).toBe(2);
    expect(tile(withBase.tiles, "firstReasonedAnswer").months).toHaveLength(6);
  });

  it("counts the stages of open cases with their average idle days", () => {
    expect(out.stages).toEqual([
      { status: "open", open: 3, avgDays: 8.7 }, // idle 14, 10, 2
      { status: "discussion", open: 1, avgDays: 1 },
    ]);
    expect(out.answers).toEqual({ yes: 3, yesProject: 2, question: 4, handed: 1, no: 5 });
  });

  it("counts the baseline over its period, and an imported value wins", () => {
    const b = { period: { from: 41, to: 70 }, input: { ...input, cases: [g], facts: facts(0.5) } };
    const counted = waitLedger(input, period, b, {});
    expect(tile(counted.tiles, "firstReasonedAnswer").baseline).toBe(2);
    expect(tile(counted.tiles, "onTime").baseline).toBe(100);
    expect(tile(counted.tiles, "overruled").baseline).toBe(50);
    expect(tile(counted.tiles, "pastPromise").baseline).toBeNull();
    const imp = (value: number) => ({ value, source: "s", sha256: "x", importedBy: "u", importedAt: "2026-01-01T00:00:00Z" });
    const imported = waitLedger(input, period, b, { withinPromisePct: imp(70), firstReasonedAnswer: imp(4.5), overrideRatePct: imp(12) });
    expect(tile(imported.tiles, "onTime").baseline).toBe(70);
    expect(tile(imported.tiles, "firstReasonedAnswer").baseline).toBe(4.5);
    expect(tile(imported.tiles, "overruled").baseline).toBe(12);
    expect(tile(waitLedger(input, period, null, { withinPromisePct: imp(70) }).tiles, "onTime").baseline).toBe(70);
  });

  it("hides every tile and the cases of a scope under five people", () => {
    expect(hiddenTiles(out.tiles).every((t) => t.hidden && t.value === null && t.months.length === 0)).toBe(true);
    const org = { units: [{ id: "u", name: "U", parentId: null, people: 3, headcount: 3 }, { id: "v", name: "V", parentId: "u", people: 2, headcount: 2 }], roles: [] };
    const scoped = scopeCases({ ...input, org, cases: [base({ caseId: "x", unitId: "v" }), base({ caseId: "y", unitId: null })] }, "u");
    expect(scoped.hidden).toBe(true);
    expect(scoped.cases.map((c) => c.caseId)).toEqual(["x"]);
  });

  describe("periodRange", () => {
    const workdays: ClockSpec = { mode: "workdays", calendar: DEFAULT_CALENDAR };
    const today = workdayOf(new Date("2026-11-03T12:00:00Z"), DEFAULT_CALENDAR);
    const bl: Baseline = { fromDay: 10, toDay: 40, fromDate: null, toDate: null, imported: {} };

    it("counts in demo mode", () => {
      expect(periodRange("30d", 100, DEMO_CLOCK, null)).toEqual({ from: 71, to: 100 });
      expect(periodRange("quarter", 100, DEMO_CLOCK, null)).toEqual({ from: 11, to: 100 });
      expect(periodRange("golive", 100, DEMO_CLOCK, bl)).toEqual({ from: 41, to: 100 });
      expect(periodRange("golive", 100, DEMO_CLOCK, null)).toBeNull();
    });

    it("counts calendar days back in workdays mode", () => {
      const p30 = periodRange("30d", today, workdays, null)!;
      expect(p30.to).toBe(today);
      expect(dateOfWorkday(p30.from, DEFAULT_CALENDAR)).toBe("2026-10-05"); // the first working day after 4 Oct
      const q = periodRange("quarter", today, workdays, null)!;
      expect(dateOfWorkday(q.from, DEFAULT_CALENDAR)).toBe("2026-10-01");
      expect(periodRange("golive", today, workdays, bl)).toEqual({ from: 41, to: today });
      expect(periodRange("golive", today, workdays, null)).toBeNull();
    });
  });

  describe("ledgerInputFromState", () => {
    it("gives one case per reduced case with its days on LOCAL_SEED", () => {
      const S = reduce(LOCAL_SEED, emptyLog());
      const inp = ledgerInputFromState(S, emptyLog(), LOCAL_SEED, S.day, true);
      expect(inp.cases).toHaveLength(S.cases.length);
      expect(inp.demoClock).toBe(true);
      for (const c of S.cases) {
        const lc = inp.cases.find((x) => x.caseId === c.id)!;
        expect(lc.raisedDay).toBe(c.raisedDay);
        const answer = c.history.find((e) => e.type === "case.decided" || e.type === "case.asked");
        expect(lc.firstResponseDay).toBe(answer ? answer.day : null);
        if (lc.firstReasonedAnswerDay !== null) expect(lc.firstResponseDay).not.toBeNull();
      }
      expect(inp.cases.some((c) => c.firstReasonedAnswerDay !== null)).toBe(true);
    });

    it("counts a hand-over as neither a response nor a reasoned answer", () => {
      let log = appendEvent(emptyLog(), { type: "case.raised", actor: "A", actorUserId: "u1", target: "h1", payload: { title: "Handed", routeId: null } });
      log = appendEvent(log, { type: "case.handed", actor: "A", target: "h1", payload: { to: "Someone", why: "away" } });
      let S = reduce(LOCAL_SEED, log);
      let lc = ledgerInputFromState(S, log, LOCAL_SEED, S.day, true).cases.find((c) => c.caseId === "h1")!;
      expect(lc).toMatchObject({ firstResponseDay: null, firstReasonedAnswerDay: null, reasoned: false, raiserKey: "u1" });
      log = appendEvent(log, { type: "case.decided", actor: "B", target: "h1", payload: { answer: "no" } }); // a no without a reason
      S = reduce(LOCAL_SEED, log);
      lc = ledgerInputFromState(S, log, LOCAL_SEED, S.day, true).cases.find((c) => c.caseId === "h1")!;
      expect(lc.firstResponseDay).toBe(0);
      expect(lc.firstReasonedAnswerDay).toBeNull();
    });
  });
});
