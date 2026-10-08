// The manager's Overview, counted from the rows: who holds the open cases, why cases wait, which
// problems nobody owns, what the decisions on the manager's desk are worth, and whether shipped work
// paid what it promised. Pure over the reduced state and the seed, like the rest of features/metrics.
import type { ReducedCase, ReducedIdea, ReducedProblem } from "@/features/cases/reducer";
import type { Initiative, OrgPerson, Outcome, Stall } from "@/features/demo/types";
import { upsideNum } from "./index";

// ── who holds the open cases ────────────────────────────────────────────
// A case sits with whoever must act now: the deputy once it ran past the promise, else the assignee.
// `paused`: a question is out and the clock waits for the answer.
export type Desk = { name: string; role: string; open: number; late: number; paused: number; movedIn: number };

export const holderOf = (c: ReducedCase) => c.escalated?.to ?? c.assignee;

export function desks(cases: readonly ReducedCase[], people: readonly OrgPerson[]): Desk[] {
  const map = new Map<string, Desk>();
  for (const c of cases) {
    if (!c.open && c.status !== "asked") continue;
    const name = holderOf(c);
    const d = map.get(name) ?? { name, role: people.find((p) => p.name === name)?.role ?? "", open: 0, late: 0, paused: 0, movedIn: 0 };
    if (c.open) d.open++; else d.paused++;
    if (c.overdue) d.late++;
    if (c.escalated) d.movedIn++;
    map.set(name, d);
  }
  return [...map.values()].sort((a, b) => b.late - a.late || b.open + b.paused - (a.open + a.paused) || a.name.localeCompare(b.name));
}

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

// ── problems nobody owns ────────────────────────────────────────────────
// Named by employees, no idea or trial on it, nobody assigned: the manager's to hand out. Most people first.
export const unownedProblems = (problems: readonly ReducedProblem[]) =>
  problems.filter((p) => p.owner === "none").sort((a, b) => b.people - a.people);

// ── decisions on the manager's desk ─────────────────────────────────────
// Each waiting idea with the cross-team work that starts once it is decided (if one is set up).
export type Decision = { idea: ReducedIdea; team: Initiative | null; due: number };

export function decisionRows(ideas: readonly ReducedIdea[], initiatives: readonly Initiative[], promiseDays: number): Decision[] {
  return ideas.map((idea) => ({ idea, team: initiatives.find((t) => t.idea === idea.id) ?? null, due: promiseDays - idea.wait }));
}

/** The euro upside of a set of ideas, in €k; ideas with no modelled value count nothing. */
export const upsideTotal = (ideas: readonly { upside: string }[]) => ideas.reduce((a, i) => a + Math.max(0, upsideNum(i.upside)), 0);

/** 450 -> "€450k", 1250 -> "€1.25M". */
export const euroK = (k: number) => (k >= 1000 ? "€" + +(k / 1000).toFixed(2) + "M" : "€" + Math.round(k) + "k");

// ── did shipped work pay ────────────────────────────────────────────────
export const deliveredCount = (outcomes: readonly Outcome[]) => outcomes.filter((o) => o.verdict !== "Short").length;
