// The Dashboard's arithmetic (MET D19): the chart geometry (line, bar heights, shares, ring), the six tiles as
// text (tileViews) and the browser fallback that builds DashboardData from the reduced state. Pure; every number
// comes from the log through the wait ledger (ledger.ts, breakdown.ts), never from a stand-in.
import { DEMO_CLOCK } from "@/features/clock";
import type { T } from "@/i18n";
import { breakdown } from "./breakdown";
import { hiddenTiles, periodRange, scopeCases, waitLedger } from "./ledger";
import type { Baseline, DashboardData, LedgerFacts, LedgerInput, Period, PilotMetricKey, Tile, TileId, TrendMonth } from "./types";

/** One point of the "cases raised per month" line, in the chart's 0-100 box. */
export type TrendPoint = { x: number; y: number; v: number };

/** Points spread from 4% to 96% across, 0 at the bottom and `yMax` at the top. */
export function trendPoints(values: readonly number[], yMax: number): TrendPoint[] {
  const step = values.length > 1 ? 92 / (values.length - 1) : 0;
  return values.map((v, i) => ({ v, x: 4 + i * step, y: 100 - (Math.min(v, yMax) / yMax) * 100 }));
}

/** The SVG line through the points, and the area under it down to the baseline. */
export function trendPaths(points: readonly TrendPoint[]): { line: string; area: string } {
  if (!points.length) return { line: "", area: "" };
  const line = points.map((p, i) => (i ? "L" : "M") + p.x.toFixed(2) + " " + p.y.toFixed(2)).join(" ");
  const first = points[0], last = points[points.length - 1];
  return { line, area: `${line} L${last.x.toFixed(2)} 100 L${first.x.toFixed(2)} 100 Z` };
}

const MONTHS = [
  "ideas.monthJan", "ideas.monthFeb", "ideas.monthMar", "ideas.monthApr", "ideas.monthMay", "ideas.monthJun",
  "ideas.monthJul", "ideas.monthAug", "ideas.monthSep", "ideas.monthOct", "ideas.monthNov", "ideas.monthDec",
] as const;

/**
 * The axis label of each trend step, oldest first: the month its last day falls in ("Oct", "Dec ’25" when the steps
 * cross a year), or - in a simulated company, which has no calendar - how far back it is ("now", "1 mo ago").
 * The catalog's month names, not Intl's: the server and the browser then render the same text.
 */
export function trendLabels(trend: readonly Pick<TrendMonth, "endDate">[], t: T): string[] {
  const dates = trend.map((m) => (m.endDate && /^\d{4}-\d{2}/.test(m.endDate) ? m.endDate : null));
  if (!dates.length || dates.some((d) => d === null)) {
    return trend.map((_, i) => (i === trend.length - 1 ? t("metrics.bucketNow") : t("metrics.bucketAgo", { count: trend.length - 1 - i })));
  }
  const crossesYear = new Set(dates.map((d) => (d as string).slice(0, 4))).size > 1;
  return dates.map((d) => {
    const month = t(MONTHS[Number((d as string).slice(5, 7)) - 1]);
    return crossesYear ? `${month} ’${(d as string).slice(2, 4)}` : month;
  });
}

/** Bar heights in % of the largest value, never under `floor` so a small month stays visible. */
export function barHeights(values: readonly number[], floor: number): number[] {
  const max = Math.max(...values, 1);
  return values.map((v) => Math.max(floor, (v / max) * 100));
}

/** Each count as a whole-number share of the total. */
export function shares(values: readonly number[]): number[] {
  const total = values.reduce((a, v) => a + v, 0);
  return values.map((v) => (total ? Math.round((v / total) * 100) : 0));
}

/** 0.84 -> the stroke offset that leaves 84% of a ring of circumference `c` drawn. */
export const ringOffset = (share: number, c = 213.6) => (c * (1 - Math.max(0, Math.min(1, share)))).toFixed(1);

// ── the six tiles as text ───────────────────────────────────────────────

export type TileTone = "worse" | "better";
export type SplitRow = { id: string; label: string; depth: number; value: string | null; share: number };
export type TileView = {
  id: TileId;
  label: string;
  note: string;
  /** Too few people behind the scope: the card shows TooFewToShow and nothing else. */
  hidden: boolean;
  value: string;
  sub: string;
  hasBaseline: boolean;
  baselineLine: string;
  /** Where the baseline number comes from, when it was imported (always shown with it). */
  provenance: string | null;
  delta: string | null;
  tone: TileTone | null;
  aiOffLine: string | null;
  months: number[];
  /** Per unit for this period; null where the number is counted for the company only. */
  split: SplitRow[] | null;
};

const LOWER_IS_BETTER: Record<TileId, boolean> = { firstReasonedAnswer: true, onTime: false, ideaToDecision: true, pastPromise: true, escalated: true, overruled: true };
const KIND: Record<TileId, "days" | "pct" | "count"> = { firstReasonedAnswer: "days", onTime: "pct", ideaToDecision: "days", pastPromise: "count", escalated: "count", overruled: "pct" };
const IMPORTED_KEY: Partial<Record<TileId, PilotMetricKey>> = { firstReasonedAnswer: "firstReasonedAnswer", onTime: "withinPromisePct", overruled: "overrideRatePct" };
const COLUMN: Partial<Record<TileId, "firstReasonedAnswer" | "onTimePct" | "pastPromise" | "escalated">> = {
  firstReasonedAnswer: "firstReasonedAnswer", onTime: "onTimePct", pastPromise: "pastPromise", escalated: "escalated",
};
const LABEL = {
  firstReasonedAnswer: "metrics.tileFirstReasonedAnswer", onTime: "metrics.tileOnTime", ideaToDecision: "metrics.tileIdeaToDecision",
  pastPromise: "metrics.tilePastPromise", escalated: "metrics.tileEscalated", overruled: "metrics.tileOverruled",
} as const;
const NOTE = {
  firstReasonedAnswer: "metrics.noteFirstReasonedAnswer", onTime: "metrics.noteOnTime", ideaToDecision: "metrics.noteIdeaToDecision",
  pastPromise: "metrics.notePastPromise", escalated: "metrics.noteEscalated", overruled: "metrics.noteOverruled",
} as const;

const round1 = (v: number) => Math.round(v * 10) / 10;

/** A number with the catalog's decimal mark, one decimal at most. */
export const formatNumber = (v: number, t: T) => String(round1(v)).replace(".", t("metrics.decimalMark"));

/** A value in the unit of its tile: working days (days in a simulated company), a percentage or a count. */
export function formatTileValue(id: TileId, v: number | null, demoClock: boolean, t: T): string {
  if (v === null) return t("metrics.valueNone");
  const n = formatNumber(v, t);
  const kind = KIND[id];
  if (kind === "days") return v === 1 ? t(demoClock ? "metrics.unitDayDemo" : "metrics.unitDay", { n }) : t(demoClock ? "metrics.unitDaysDemo" : "metrics.unitDays", { n });
  return kind === "pct" ? t("metrics.unitPct", { n }) : n;
}

function deltaOf(id: TileId, tile: Tile, t: T): { delta: string | null; tone: TileTone | null } {
  if (tile.value === null || tile.baseline === null) return { delta: null, tone: null };
  const d = round1(tile.value - tile.baseline);
  if (d === 0) return { delta: null, tone: null };
  const sign = d > 0 ? "+" : "−";
  const n = formatNumber(Math.abs(d), t);
  const kind = KIND[id];
  const delta = t(kind === "days" ? "metrics.deltaDays" : kind === "pct" ? "metrics.deltaPts" : "metrics.deltaCount", { sign, n });
  // Worse is red, better is plain ink; no tile is ever green.
  return { delta, tone: (LOWER_IS_BETTER[id] ? d > 0 : d < 0) ? "worse" : "better" };
}

function splitOf(id: TileId, data: DashboardData, t: T): SplitRow[] | null {
  const col = COLUMN[id];
  if (!col) return null;
  const max = Math.max(1, ...data.units.map((u) => (u.hidden ? 0 : u[col] ?? 0)));
  return data.units.map((u) => {
    const v = u.hidden ? null : u[col];
    return { id: u.id, label: u.label, depth: u.depth, value: v === null ? null : formatTileValue(id, v, data.demoClock, t), share: v === null ? 0 : (v / max) * 100 };
  });
}

export function tileViews(data: DashboardData, t: T): TileView[] {
  return data.tiles.map((tile) => {
    const base = { id: tile.id, label: t(LABEL[tile.id]), note: t(NOTE[tile.id]), hidden: tile.hidden, months: tile.months };
    if (tile.hidden) {
      return { ...base, value: "", sub: "", hasBaseline: false, baselineLine: "", provenance: null, delta: null, tone: null, aiOffLine: null, split: null };
    }
    const key = IMPORTED_KEY[tile.id];
    const imp = key ? data.baseline?.imported[key] : undefined;
    const hasBaseline = tile.baseline !== null;
    let baselineLine: string;
    if (data.baseline === null) baselineLine = t("metrics.baselineNone");
    else if (!hasBaseline) baselineLine = t("metrics.baselineMissing");
    else baselineLine = t("metrics.baselineValue", { value: formatTileValue(tile.id, tile.baseline, data.demoClock, t) }) + " · " + t(imp ? "metrics.baselineImported" : "metrics.baselineCounted");
    let value = formatTileValue(tile.id, tile.value, data.demoClock, t);
    let sub = "";
    if (tile.id === "pastPromise" && tile.value !== null && tile.of !== null) sub = t("metrics.subOpen", { n: tile.of });
    if (tile.id === "overruled") {
      if (tile.value !== null && tile.of !== null) value = t("metrics.valueOf", { o: Math.round((tile.value / 100) * tile.of), p: tile.of });
      sub = t(data.aiOff ? "metrics.overruledKeywords" : "metrics.overruledAi");
    }
    return {
      ...base, value, sub, hasBaseline, baselineLine,
      provenance: imp ? t("metrics.overlayProvenance", { source: imp.source, hash: imp.sha256.slice(0, 8), date: imp.importedAt.slice(0, 10) }) : null,
      ...deltaOf(tile.id, tile, t),
      aiOffLine: tile.id === "overruled" && data.aiOff ? t("metrics.aiOffLine") : null,
      split: splitOf(tile.id, data, t),
    };
  });
}

// ── the browser fallback ────────────────────────────────────────────────

const NO_FACTS: LedgerFacts = { answers: { yes: 0, yesProject: 0, question: 0, handed: 0, no: 0 }, override: { proposed: 0, overridden: 0, rate: null } };

/**
 * DashboardData from a ledger input in the browser (no database): the same pure functions the server uses.
 * The simulated company has no calendar, so the period is counted in day numbers.
 */
export function dashboardFromInput(input: LedgerInput, kind: "30d" | "quarter" | "golive", unitId: string | null, baseline: Baseline | null, aiOff: boolean): DashboardData {
  const period: Period = periodRange(kind, input.today, DEMO_CLOCK, baseline) ?? (periodRange("30d", input.today, DEMO_CLOCK, baseline) as Period);
  const scope = scopeCases(input, unitId);
  const scoped: LedgerInput = { ...input, cases: scope.cases, facts: unitId === null ? input.facts : NO_FACTS };
  const before = baseline ? { period: { from: baseline.fromDay, to: baseline.toDay }, input: { ...input, cases: scope.cases } } : null;
  const ledger = waitLedger(scoped, period, before, baseline?.imported ?? {});
  return {
    period, fromDate: null, toDate: null, baseline,
    ...(scope.hidden ? { tiles: hiddenTiles(ledger.tiles), trend: [], stages: [], answers: NO_FACTS.answers, caseCount: 0 } : ledger),
    units: breakdown(input, period, "unit"),
    roles: breakdown(input, period, "role"),
    scopeHidden: scope.hidden,
    aiOff,
    demoClock: true,
  };
}
