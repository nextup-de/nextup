// The Dashboard's arithmetic: the line chart's geometry, spark and bar heights, shares of a total,
// and the promise check. Pure; the numbers come from the seed and the stand-in (dashboardPreview).

/** One point of the "ideas raised per month" line, in the chart's 0-100 box. */
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

/** Waiting past the promise: more days than promised, for every stage but work already running. */
export const pastPromise = (days: number, promiseDays: number, running = false) => !running && days > promiseDays;

/** 0.84 -> the stroke offset that leaves 84% of a ring of circumference `c` drawn. */
export const ringOffset = (share: number, c = 213.6) => (c * (1 - Math.max(0, Math.min(1, share)))).toFixed(1);
