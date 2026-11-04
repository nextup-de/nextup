// What the Dashboard counts from the rows: why cases wait, and whether shipped work paid what it
// promised. Pure over the seed, like the rest of features/metrics. (The Overview's desks, decisions
// and upside moved to features/overview/rows or went with the manager preview: MET D17.)
import type { Outcome, Stall } from "@/features/demo/types";

// ── why cases wait ──────────────────────────────────────────────────────
// Two of the four stall reasons are routing (the case went to the wrong desk, or to nobody); the
// other two are the receiver's time and priority. The split says whether to fix the map or the load.
const ROUTING = ["Wrong department", "Not responsible"];
export const isRouting = (reason: string) => ROUTING.includes(reason);

export type StallSplit = { total: number; routing: number; parts: (Stall & { routing: boolean; pct: number })[] };

export function stallSplit(stall: readonly Stall[]): StallSplit | null {
  const total = stall.reduce((a, s) => a + s.days, 0);
  if (!total) return null;
  const parts = stall.map((s) => ({ ...s, routing: isRouting(s.reason), pct: Math.round((s.days / total) * 100) }));
  return { total, routing: parts.filter((p) => p.routing).reduce((a, p) => a + p.days, 0), parts };
}

// ── did shipped work pay ────────────────────────────────────────────────
export const deliveredCount = (outcomes: readonly Outcome[]) => outcomes.filter((o) => o.verdict !== "Short").length;
