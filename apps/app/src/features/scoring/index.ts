// The case score: how much a raised problem or idea matters, from facts on the case - never
// from who raised it (board §17: score the case, never the person). Arithmetic over facts, so the
// demo can explain every point; a model's proposal earns no points (HD16): a route the model
// proposed is shown as such, and only a route the keywords found or a person chose scores.
import type { CaseEvent } from "@/features/cases/events";
import { createT, type T } from "@/i18n";
import { routeSourceOf, type RouteSource } from "./route-source";

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
  routeSource?: RouteSource | null; // who found the route; wins over `history`
  history?: readonly CaseEvent[]; // the case's events: the route source is read from them
};

const BASE = 35;
const MAX = 96;

/** `t` words the labels (English without it). */
export function scoreCase(c: Scorable, promiseDays: number, t: T = createT("en")): Score {
  const parts: ScorePart[] = [];
  const source = c.routeSource !== undefined ? c.routeSource : c.history ? routeSourceOf(c.history) : null;
  if (c.routeId) parts.push(source === "llm" ? { label: t("dashboard.scoreRouteAi"), points: 0 } : { label: t("dashboard.scoreFitsMap"), points: 20 });
  if (c.upside.trim()) parts.push({ label: t("dashboard.scoreUpside"), points: 15 });
  if (c.body.trim().length >= 40) parts.push({ label: t("dashboard.scoreDetail"), points: 10 });
  if (c.open && c.age > 0) parts.push({ label: t("dashboard.scoreWaiting", { n: c.age }), points: Math.min(15, c.age) });
  if (c.open && c.age > promiseDays) parts.push({ label: t("dashboard.scorePastPromise"), points: 5 });
  if (c.affected) parts.push({ label: t("dashboard.scoreAffects", { n: c.affected }), points: Math.min(15, c.affected * 5) });
  if (c.evidence) parts.push({ label: t("dashboard.scoreEvidence"), points: 10 });
  if (c.updates) parts.push({ label: c.updates > 1 ? t("dashboard.scoreNewsTimes", { n: c.updates }) : t("dashboard.scoreNews"), points: Math.min(10, c.updates * 5) });
  const value = Math.min(MAX, parts.reduce((a, p) => a + p.points, BASE));
  return { value, parts };
}

// Three bands for the dot display: quiet / notable / strong.
export type ScoreBand = "low" | "mid" | "high";
export const scoreBand = (v: number): ScoreBand => (v >= 80 ? "high" : v >= 60 ? "mid" : "low");
