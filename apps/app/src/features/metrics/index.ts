// Everything counted from the rows: rail counts, people, search helpers. No per-person ranking.
// Pure functions over seed + reduced state. Nothing here touches React or the database.
// Port of the counting half of legacy/demo/js/dashboard.js renderVals().
import type { ReducedCase, ReducedIdea, ReducedProblem, State } from "@/features/cases/reducer";
import type { Buddy, Initiative, Outcome, OrgPerson, Seed, Stall, WaitingOn } from "@/features/demo/types";

export function median(values: readonly number[]): number | null {
  if (values.length === 0) return null;
  const a = [...values].sort((x, y) => x - y);
  const m = a.length >> 1;
  return a.length % 2 ? a[m] : (a[m - 1] + a[m]) / 2;
}

export function pctWithin(values: readonly number[], limit: number): number | null {
  if (values.length === 0) return null;
  return Math.round((values.filter((v) => v <= limit).length / values.length) * 100);
}

// Demo data on/off: one switch, every list reads through it. With demo data off only what was
// created in this browser remains - the honest day-one install.
export type DemoData = {
  problems: ReducedProblem[]; ideas: ReducedIdea[]; initiatives: Initiative[]; outcomes: Outcome[]; people: OrgPerson[];
  cases: ReducedCase[]; waitingOn: WaitingOn[]; buddies: Buddy[]; stall: Stall[];
};

export function demoData(seed: Seed, S: State, demo: boolean): DemoData {
  return {
    problems: demo ? S.problems : [], ideas: demo ? S.ideas : [], initiatives: demo ? seed.initiatives : [],
    outcomes: demo ? seed.outcomes : [], people: demo ? seed.people : [],
    cases: demo ? S.cases : S.cases.filter((c) => !c.seed), waitingOn: demo ? seed.waitingOn : [], buddies: seed.buddies, stall: demo ? seed.stall : [],
  };
}

export type Counts = {
  people: number; problems: number; ideas: number; initiatives: number; signals: number; awaiting: number; noOwner: number;
  funded: number; shippedIdeas: number; shippedTeams: number; teamsInMotion: number; overdueIdeas: number;
};

export function counts(seed: Seed, D: DemoData): Counts {
  return {
    people: seed.depts.reduce((a, d) => a + d.people, 0),
    problems: D.problems.length, ideas: D.ideas.length, initiatives: D.initiatives.length,
    signals: D.problems.reduce((a, p) => a + p.signals.length, 0),
    awaiting: D.ideas.filter((i) => i.status === "Awaiting decision").length,
    noOwner: D.ideas.filter((i) => i.team.length === 1 && i.team[0] === "—").length,
    funded: D.ideas.filter((i) => ["In trial", "Building", "Shipped"].includes(i.status)).length,
    shippedIdeas: D.ideas.filter((i) => i.status === "Shipped").length,
    shippedTeams: D.initiatives.filter((t) => t.status === "Shipped").length,
    teamsInMotion: D.initiatives.filter((t) => t.people > 0 && t.status !== "Shipped").length,
    overdueIdeas: D.ideas.filter((i) => i.status === "Awaiting decision" && i.wait > seed.promiseDays).length,
  };
}

// People come from initiative members, idea teams and proposers, signal authors and the buddy list.
export type Person = { name: string; roles: string[]; teams: string[]; ideas: string[] };

export function people(D: DemoData): Person[] {
  const map: Record<string, Person> = {};
  const add = (raw: string | undefined, role: string, ref: { team?: string; idea?: string } | null) => {
    const name = (raw ?? "").trim();
    if (!name || name === "—" || name.startsWith("Anonymous") || /^\d/.test(name)) return;
    const e = map[name] ?? (map[name] = { name, roles: [], teams: [], ideas: [] });
    if (role && !e.roles.includes(role)) e.roles.push(role);
    if (ref?.team && !e.teams.includes(ref.team)) e.teams.push(ref.team);
    if (ref?.idea && !e.ideas.includes(ref.idea)) e.ideas.push(ref.idea);
  };
  D.initiatives.forEach((t) => t.members.forEach((m) => add(m.name, m.role, { team: t.id })));
  D.ideas.forEach((i) => {
    i.team.forEach((n) => add(n, "", { idea: i.id }));
    const pb = i.proposedBy.split(",");
    add(pb[0], (pb[1] ?? "").trim(), { idea: i.id });
  });
  D.problems.forEach((p) => p.signals.forEach((x) => { const b = x.by.split("·"); add(b[0], (b[1] ?? "").trim(), null); }));
  D.buddies.forEach((b) => add(b.name, b.dept, null));
  return Object.keys(map).sort().map((k) => map[k]);
}

// Overview -> "Answer owed": ideas awaiting a decision, longest wait first.
export const decisionsWaiting = (D: DemoData) =>
  D.ideas.filter((i) => i.status === "Awaiting decision").sort((a, b) => b.wait - a.wait);

// Seed reads "6 of 54" (or a bare percentage); every live override adds one to both sides.
export function overridesLabel(seedValue: string, live: number): string {
  if (!live) return seedValue;
  const m = /^(\d+)\s+of\s+(\d+)$/.exec(seedValue);
  return m ? +m[1] + live + " of " + (+m[2] + live) : (parseFloat(seedValue) || 0) + live + "%";
}

// "€240k" -> 240, "€1.2M" -> 1200, anything else -> -1 (sorts last)
export function upsideNum(v: string): number {
  const m = /€\s*([\d.]+)\s*(k|M)?/i.exec(v || "");
  return m ? parseFloat(m[1]) * (m[2] === "M" ? 1000 : 1) : -1;
}

export const criteriaCount = (c: { fit: boolean; urgent: boolean; kpi: string | null }) => (c.fit ? 1 : 0) + (c.urgent ? 1 : 0) + (c.kpi ? 1 : 0);
