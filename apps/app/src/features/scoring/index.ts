// The case score: how much a raised problem or idea matters, from facts on the case - never
// from who raised it (board §17: score the case, never the person). Deterministic, so the demo
// can explain every point; a model can replace the arithmetic later without changing the shape.
export type ScorePart = { label: string; points: number };
export type Score = { value: number; parts: ScorePart[] };

export type Scorable = {
  routeId: string | null; // the map has an owner for it
  upside: string; // what it is worth, in the raiser's words
  body: string; // the detail line
  age: number; // days since raised
  open: boolean;
  affected?: number; // people who said "this affects me too"
  evidence?: number; // screenshots or images attached
  updates?: number; // new information posted since, each one a re-evaluation
};

const BASE = 35;
const MAX = 96;

export function scoreCase(c: Scorable, promiseDays: number): Score {
  const parts: ScorePart[] = [];
  if (c.routeId) parts.push({ label: "Fits a decision type on the map", points: 20 });
  if (c.upside.trim()) parts.push({ label: "Upside stated", points: 15 });
  if (c.body.trim().length >= 40) parts.push({ label: "Described in detail", points: 10 });
  if (c.open && c.age > 0) parts.push({ label: "Waiting " + c.age + " d", points: Math.min(15, c.age) });
  if (c.open && c.age > promiseDays) parts.push({ label: "Past the promise", points: 5 });
  if (c.affected) parts.push({ label: "Affects " + c.affected + " more", points: Math.min(15, c.affected * 5) });
  if (c.evidence) parts.push({ label: "Evidence attached", points: 10 });
  if (c.updates) parts.push({ label: "New information" + (c.updates > 1 ? " ×" + c.updates : ""), points: Math.min(10, c.updates * 5) });
  const value = Math.min(MAX, parts.reduce((a, p) => a + p.points, BASE));
  return { value, parts };
}

// Three bands for the dot display: quiet / notable / strong.
export type ScoreBand = "low" | "mid" | "high";
export const scoreBand = (v: number): ScoreBand => (v >= 80 ? "high" : v >= 60 ? "mid" : "low");
