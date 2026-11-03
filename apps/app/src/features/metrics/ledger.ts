// The wait ledger (MET D10): the arithmetic of the Dashboard tiles, trend, stages and answers. Pure, so the
// server and the browser fallback compute the same numbers. Counted from events people or rules wrote, never
// from a model value (D5); a hand-over is never an answer.
import type { ClockSpec } from "@/features/clock";
import { dateOfWorkday, workdayOf } from "@/features/clock/calendar";
import { median } from "./index";
import {
  MIN_GROUP,
  type Baseline,
  type DashboardData,
  type LedgerCase,
  type LedgerInput,
  type Period,
  type PilotMetricKey,
  type StageRow,
  type Tile,
  type TileId,
  type TrendMonth,
} from "./types";

const DAY_MS = 86_400_000;
/** The trend buckets: six runs of this many days, the last one ending where the period ends. */
export const TREND_MONTHS = 6;
export const TREND_DAYS = 30;

const msOf = (iso: string): number => Date.parse(iso + "T12:00:00Z");

/** The period of a fixed option; null for 'golive' without a baseline (or one that has not ended yet). */
export function periodRange(kind: "30d" | "quarter" | "golive", today: number, clock: ClockSpec, baseline: Baseline | null): Period | null {
  if (kind === "golive") {
    if (!baseline || baseline.toDay + 1 > today) return null;
    return { from: baseline.toDay + 1, to: today };
  }
  if (clock.mode !== "workdays" || today < 1) {
    // The simulated day counter has no calendar: a quarter is 90 days.
    return { from: today - (kind === "30d" ? 29 : 89), to: today };
  }
  const date = new Date(msOf(dateOfWorkday(today, clock.calendar)));
  // The window starts on the first working day after the cutoff date.
  const cutoff =
    kind === "30d"
      ? date.getTime() - 30 * DAY_MS
      : Date.UTC(date.getUTCFullYear(), Math.floor(date.getUTCMonth() / 3) * 3, 1, 12) - DAY_MS;
  return { from: workdayOf(new Date(cutoff), clock.calendar) + 1, to: today };
}

const inPeriod = (day: number | null, p: Period): boolean => day !== null && day >= p.from && day <= p.to;
const pct = (n: number, of: number): number | null => (of === 0 ? null : Math.round((n / of) * 100));

type Counted = { value: number | null; of: number | null };

const answeredOnTime = (c: LedgerCase, promiseDays: number): boolean => c.firstResponseDay !== null && c.firstResponseDay - c.raisedDay <= promiseDays;

/** On time: first responses within the promise out of those plus open cases already past it (late); open cases within it are left out. */
export function onTimeOf(cases: readonly LedgerCase[], promiseDays: number, today: number): Counted {
  let ok = 0;
  let all = 0;
  for (const c of cases) {
    if (c.firstResponseDay !== null) {
      all++;
      if (answeredOnTime(c, promiseDays)) ok++;
    } else if (c.open && today - c.raisedDay > promiseDays) all++;
  }
  return { value: pct(ok, all), of: all };
}

/** Median wait to the first reasoned answer over the cases raised in the period. */
export function reasonedWaitOf(raised: readonly LedgerCase[]): Counted {
  const waits = raised.filter((c) => c.firstReasonedAnswerDay !== null).map((c) => (c.firstReasonedAnswerDay as number) - c.raisedDay);
  return { value: median(waits), of: waits.length };
}

function tileValue(id: TileId, input: LedgerInput, p: Period): Counted {
  const cases = input.cases;
  switch (id) {
    case "firstReasonedAnswer":
      return reasonedWaitOf(cases.filter((c) => inPeriod(c.raisedDay, p)));
    case "onTime":
      return onTimeOf(cases.filter((c) => inPeriod(c.raisedDay, p)), input.promiseDays, input.today);
    case "ideaToDecision": {
      const waits = cases.filter((c) => c.kind === "idea" && inPeriod(c.decidedDay, p)).map((c) => (c.decidedDay as number) - c.raisedDay);
      return { value: median(waits), of: waits.length };
    }
    case "pastPromise": {
      if (p.to !== input.today) return { value: null, of: null };
      const open = cases.filter((c) => c.open);
      return { value: open.filter((c) => c.dueDay < input.today).length, of: open.length };
    }
    case "escalated":
      return { value: cases.filter((c) => inPeriod(c.escalatedDay, p)).length, of: null };
    case "overruled": {
      const o = input.facts.override;
      return { value: o.rate === null ? null : Math.round(o.rate * 100), of: o.proposed };
    }
  }
}

const TILE_IDS: TileId[] = ["firstReasonedAnswer", "onTime", "ideaToDecision", "pastPromise", "escalated", "overruled"];
const IMPORTED_KEY: Partial<Record<TileId, PilotMetricKey>> = {
  firstReasonedAnswer: "firstReasonedAnswer",
  onTime: "withinPromisePct",
  overruled: "overrideRatePct",
};

/** The six month buckets ending at `to`, oldest first. */
function buckets(to: number): Period[] {
  return Array.from({ length: TREND_MONTHS }, (_, i) => {
    const end = to - TREND_DAYS * (TREND_MONTHS - 1 - i);
    return { from: end - TREND_DAYS + 1, to: end };
  });
}

/** A tile's last six monthly values; a month with no value is 0. Overruled has no per-month fact and stays 0. */
function monthlyTile(id: TileId, input: LedgerInput, to: number): number[] {
  return buckets(to).map((b) => {
    if (id === "overruled") return 0;
    if (id === "pastPromise") {
      if (to !== input.today) return 0;
      return input.cases.filter((c) => inPeriod(c.raisedDay, b) && c.open && c.dueDay < input.today).length;
    }
    return tileValue(id, input, b).value ?? 0;
  });
}

function stagesOf(input: LedgerInput): StageRow[] {
  const by = new Map<string, number[]>();
  for (const c of input.cases) {
    if (!c.open) continue;
    const list = by.get(c.status) ?? [];
    list.push(input.today - c.lastDay);
    by.set(c.status, list);
  }
  return [...by.entries()].map(([status, ages]) => ({
    status,
    open: ages.length,
    avgDays: Math.round((ages.reduce((a, v) => a + v, 0) / ages.length) * 10) / 10,
  }));
}

function trendOf(input: LedgerInput, p: Period, baseline: Period | null): TrendMonth[] {
  return buckets(p.to).map((b) => {
    const raised = input.cases.filter((c) => inPeriod(c.raisedDay, b));
    const answered = raised.filter((c) => c.firstResponseDay !== null);
    return {
      // The bucket's first day number; the page turns it into a month name with the company clock.
      month: String(b.from),
      raised: raised.length,
      answered: answered.length,
      onTime: answered.filter((c) => answeredOnTime(c, input.promiseDays)).length,
      baseline: baseline !== null && b.from <= baseline.to && b.to >= baseline.from,
    };
  });
}

export function waitLedger(
  input: LedgerInput,
  period: Period,
  baseline: { period: Period; input: LedgerInput } | null,
  imported: Baseline["imported"],
): Pick<DashboardData, "tiles" | "trend" | "stages" | "answers" | "caseCount"> {
  const tiles: Tile[] = TILE_IDS.map((id) => {
    const now = tileValue(id, input, period);
    const key = IMPORTED_KEY[id];
    const importedValue = key ? imported[key]?.value : undefined;
    const counted = baseline ? tileValue(id, baseline.input, baseline.period).value : null;
    return {
      id,
      value: now.value,
      of: now.of,
      baseline: importedValue !== undefined ? importedValue : counted,
      months: monthlyTile(id, input, period.to),
      hidden: false,
    };
  });
  return {
    tiles,
    trend: trendOf(input, period, baseline?.period ?? null),
    stages: stagesOf(input),
    answers: input.facts.answers,
    caseCount: input.cases.filter((c) => inPeriod(c.raisedDay, period)).length,
  };
}

/** Every tile without a number: a scope under MIN_GROUP people (D11). */
export const hiddenTiles = (tiles: Tile[]): Tile[] => tiles.map((t) => ({ ...t, value: null, of: null, baseline: null, months: [], hidden: true }));

/** The unit and its sub-units, as ids. Empty when the unit is unknown. */
export function unitSubtree(input: LedgerInput, unitId: string): Set<string> {
  const ids = new Set<string>();
  if (!input.org.units.some((u) => u.id === unitId)) return ids;
  const add = (id: string) => {
    if (ids.has(id)) return;
    ids.add(id);
    input.org.units.filter((u) => u.parentId === id).forEach((u) => add(u.id));
  };
  add(unitId);
  return ids;
}

/** The cases of a unit and its sub-units (all of them for null), and whether the scope is too small to show (D11). */
export function scopeCases(input: LedgerInput, unitId: string | null): { cases: LedgerCase[]; hidden: boolean } {
  if (unitId === null) return { cases: input.cases, hidden: false };
  const unit = input.org.units.find((u) => u.id === unitId);
  if (!unit) return { cases: [], hidden: true };
  const ids = unitSubtree(input, unitId);
  return { cases: input.cases.filter((c) => c.unitId !== null && ids.has(c.unitId)), hidden: unit.people < MIN_GROUP };
}
