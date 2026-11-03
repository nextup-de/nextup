import { describe, expect, it } from "vitest";
import { pilotMetrics } from "@/features/metrics/pilot";
import { PILOT_METRIC_KEYS, type KpiProject, type LedgerCase, type LedgerInput } from "@/features/metrics/types";

let n = 0;
const kase = (o: Partial<LedgerCase> = {}): LedgerCase => ({
  caseId: `c${n++}`, kind: "idea", status: "open", open: true, unitId: null, roleId: null, raisedDay: 10,
  firstResponseDay: null, firstReasonedAnswerDay: null, decidedDay: null, decision: null, withProject: false,
  reasoned: false, dueDay: 15, lastDay: 10, escalatedDay: null, raiserKey: null, raiserUnitId: null, ...o,
});
const facts = { answers: { yes: 0, yesProject: 0, question: 0, handed: 0, no: 0 }, override: { proposed: 0, overridden: 0, rate: null } };
const input = (cases: LedgerCase[], today = 200): LedgerInput => ({ cases, facts, org: { units: [], roles: [] }, promiseDays: 5, today, demoClock: false });
const period = { from: 0, to: 100 };
type Args = Parameters<typeof pilotMetrics>[0];
const run = (cases: LedgerCase[], extra: Partial<Args> = {}) =>
  pilotMetrics({ ledger: input(cases), projects: [], period, peopleInScope: 50, baseline: null, imported: {}, ...extra });
const get = (ms: ReturnType<typeof run>, key: (typeof PILOT_METRIC_KEYS)[number]) => ms.find((m) => m.key === key)!;
// People with a reasoned No at day 20; the first `again` of them raise again at day 30.
const noPeople = (count: number, again: number) =>
  Array.from({ length: count }, (_, i) => [
    kase({ raiserKey: `p${i}`, raisedDay: 10, open: false, decision: "no", reasoned: true, decidedDay: 20 }),
    ...(i < again ? [kase({ raiserKey: `p${i}`, raisedDay: 30 })] : []),
  ]).flat();

describe("MET pilot metrics", () => {
  it("has every pilot key in order", () => {
    expect(run([]).map((m) => m.key)).toEqual([...PILOT_METRIC_KEYS]);
  });

  it("takes firstReasonedAnswer as the median of answer day minus raised day (D10)", () => {
    const cases = [2, 4, 9].map((d) => kase({ raisedDay: 10, firstReasonedAnswerDay: 10 + d })).concat(kase());
    expect(get(run(cases), "firstReasonedAnswer").value).toBe(4);
  });

  it("measures within-promise on first responses; open past promise is late, open within is left out", () => {
    const cases = [
      kase({ firstResponseDay: 12 }), // on time
      kase({ firstResponseDay: 30 }), // late
      kase({ raisedDay: 50 }), // open, past the promise at day 200: late
    ];
    expect(get(run(cases), "withinPromisePct").value).toBe(33);
    const early = pilotMetrics({ ledger: input(cases, 52), projects: [], period, peopleInScope: 50, baseline: null, imported: {} });
    expect(get(early, "withinPromisePct").value).toBe(50); // the open case is still within its promise
  });

  it("records shopFloorPct as not recorded", () => {
    expect(get(run([]), "shopFloorPct")).toMatchObject({ value: null, note: "not-recorded" });
  });

  it("counts resubmission after a reasoned No by people: 3 of 6 is 50, 4 people are too few", () => {
    expect(get(run(noPeople(6, 3)), "resubmissionAfterNoPct")).toMatchObject({ value: 50, hidden: false, note: null });
    expect(get(run(noPeople(4, 3)), "resubmissionAfterNoPct")).toMatchObject({ value: null, hidden: true, note: "too-few" });
  });

  it("hides participation below 5 raisers", () => {
    const four = [1, 2, 3, 4].map((i) => kase({ raiserKey: `r${i}` }));
    expect(get(run(four), "participationPct")).toMatchObject({ value: null, hidden: true, note: "too-few" });
    const five = [...four, kase({ raiserKey: "r5" })];
    expect(get(run(five), "participationPct").value).toBe(10);
    expect(get(run(five), "casesPer10").value).toBe(1);
  });

  it("sums verified better outcomes of finished projects only", () => {
    const projects: KpiProject[] = [
      { caseId: "a", raiserUnitId: null, decidedDay: 20, doneDay: 40, premiumsEur: 0, measures: [
        { verified: true, better: true, eur: 100, kwh: 10, co2Kg: 5 }, { verified: false, better: true, eur: 900, kwh: null, co2Kg: null } ] },
      { caseId: "b", raiserUnitId: null, decidedDay: 20, doneDay: null, premiumsEur: 0, measures: [] },
    ];
    const ms = run([], { projects });
    expect(get(ms, "implementationPct").value).toBe(50);
    expect(get(ms, "verifiedOutcomes").value).toBe(1);
    expect(get(ms, "verifiedSavingsEur").value).toBe(100);
    expect(get(ms, "verifiedEnergyKwh").value).toBe(10);
    expect(get(ms, "verifiedCo2Kg").value).toBe(5);
  });

  it("lets an imported baseline win over the counted one", () => {
    const base = input([kase({ raisedDay: 210, firstReasonedAnswerDay: 218 })]);
    const baseline = { input: base, projects: [], period: { from: 200, to: 300 } };
    const imp = { firstReasonedAnswer: { value: 3.5, source: "Tickets", sha256: "x", importedBy: "u", importedAt: "t" } };
    expect(get(run([], { baseline, imported: imp }), "firstReasonedAnswer").baseline).toBe(3.5);
    expect(get(run([], { baseline }), "firstReasonedAnswer").baseline).toBe(8);
    expect(get(run([]), "firstReasonedAnswer").baseline).toBeNull();
  });
});
