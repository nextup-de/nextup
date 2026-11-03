// The pilot's own metrics (MET D14), one entry per PILOT_METRIC_KEYS in order. Pure. People are only ever counted
// (distinct raiser keys), never returned (D2); a number with fewer than MIN_GROUP people behind it is hidden (D6).
import { median } from "./index";
import { MIN_GROUP, PILOT_METRIC_KEYS, type Baseline, type KpiProject, type LedgerInput, type PilotMetric, type PilotMetricKey, type Period } from "./types";

type Counted = Record<PilotMetricKey, Pick<PilotMetric, "value" | "hidden" | "note">>;

const ok = (value: number | null) => ({ value, hidden: false, note: null });
const tooFew = { value: null, hidden: true, note: "too-few" as const };
const pct = (part: number, whole: number) => (whole === 0 ? null : Math.round((part / whole) * 100));
const inPeriod = (d: number | null, p: Period): d is number => d !== null && d >= p.from && d <= p.to;

function count(ledger: LedgerInput, projects: KpiProject[], period: Period, peopleInScope: number): Counted {
  const raised = ledger.cases.filter((c) => inPeriod(c.raisedDay, period));

  const firstReasoned = raised.flatMap((c) => (c.firstReasonedAnswerDay === null ? [] : [c.firstReasonedAnswerDay - c.raisedDay]));
  // On time: a first response (decided or asked, never a hand-over) within the promise. An open case past the
  // promise is late, one still within it is left out.
  let onTime = 0;
  let judged = 0;
  for (const c of raised) {
    if (c.firstResponseDay !== null) {
      judged++;
      if (c.firstResponseDay - c.raisedDay <= ledger.promiseDays) onTime++;
    } else if (!c.open || ledger.today - c.raisedDay > ledger.promiseDays) judged++;
  }

  const a = ledger.facts.answers;
  const o = ledger.facts.override;

  const raisers = new Set(raised.flatMap((c) => (c.raiserKey === null ? [] : [c.raiserKey]))).size;
  const scoped = peopleInScope >= MIN_GROUP;

  const decided = projects.filter((p) => inPeriod(p.decidedDay, period));
  const finished = projects.filter((p) => inPeriod(p.doneDay, period));
  const good = finished.map((p) => p.measures.filter((m) => m.verified && m.better));
  const sum = (pick: (m: KpiProject["measures"][number]) => number | null) =>
    finished.length === 0 ? null : good.flat().reduce((t, m) => t + (pick(m) ?? 0), 0);

  // Resubmission: people with a reasoned No decided in the period who raised again after it, up to the period end.
  const firstNo = new Map<string, number>();
  for (const c of ledger.cases) {
    if (c.raiserKey === null || c.decision !== "no" || !c.reasoned || !inPeriod(c.decidedDay, period)) continue;
    firstNo.set(c.raiserKey, Math.min(firstNo.get(c.raiserKey) ?? Infinity, c.decidedDay));
  }
  let again = 0;
  for (const [key, day] of firstNo) {
    if (ledger.cases.some((c) => c.raiserKey === key && c.raisedDay > day && c.raisedDay <= period.to)) again++;
  }

  return {
    firstReasonedAnswer: ok(median(firstReasoned)),
    withinPromisePct: ok(pct(onTime, judged)),
    deputyHandoverPct: ok(pct(a.handed, a.yes + a.yesProject + a.question + a.handed + a.no)),
    participationPct: raisers < MIN_GROUP || !scoped ? tooFew : ok(pct(raisers, peopleInScope)),
    casesPer10: scoped ? ok(Math.round((raised.length / peopleInScope) * 100) / 10) : tooFew,
    shopFloorPct: { value: null, hidden: false, note: "not-recorded" },
    implementationPct: ok(pct(decided.filter((p) => inPeriod(p.doneDay, period)).length, decided.length)),
    verifiedOutcomes: ok(good.filter((m) => m.length > 0).length),
    verifiedSavingsEur: ok(sum((m) => m.eur)),
    verifiedEnergyKwh: ok(sum((m) => m.kwh)),
    verifiedCo2Kg: ok(sum((m) => m.co2Kg)),
    overrideRatePct: ok(pct(o.overridden, o.proposed)),
    resubmissionAfterNoPct: firstNo.size < MIN_GROUP ? tooFew : ok(pct(again, firstNo.size)),
  };
}

export function pilotMetrics(input: {
  ledger: LedgerInput;
  projects: KpiProject[];
  period: Period;
  peopleInScope: number;
  baseline: { input: LedgerInput; projects: KpiProject[]; period: Period } | null;
  imported: Baseline["imported"];
}): PilotMetric[] {
  const { ledger, projects, period, peopleInScope, baseline, imported } = input;
  const now = count(ledger, projects, period, peopleInScope);
  const before = baseline ? count(baseline.input, baseline.projects, baseline.period, peopleInScope) : null;
  return PILOT_METRIC_KEYS.map((key) => ({
    key,
    ...now[key],
    baseline: imported[key]?.value ?? before?.[key].value ?? null,
  }));
}
