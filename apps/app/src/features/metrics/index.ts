// Everything counted from the rows: rail counts, funnel, KPIs, contributors, the wait ledger.
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

// Progress -> "Most relied-on contributors", tallied from signals, ideas and teams.
export type Contributor = { name: string; dept: string; signals: number; ideas: number; shipped: number; building: number; awaiting: number };

export function contributors(D: DemoData, handle: string | null): Contributor[] {
  const tally: Record<string, Contributor> = {};
  const person = (name: string | undefined, dept: string) => {
    if (!name || name === "—") return null;
    const k = name.trim();
    if (!tally[k]) tally[k] = { name: k, dept: dept || "", signals: 0, ideas: 0, shipped: 0, building: 0, awaiting: 0 };
    if (dept && !tally[k].dept) tally[k].dept = dept;
    return tally[k];
  };
  D.problems.forEach((p) => p.signals.forEach((sg) => {
    const parts = sg.by.split(" · ");
    const r = person(parts[0], (parts[1] ?? "").replace(/,.*$/, ""));
    if (r) r.signals++;
  }));
  D.ideas.forEach((i) => {
    const parts = i.proposedBy.split(", ");
    const r = /^\d+ people/.test(i.proposedBy) ? null : person(parts[0], parts[1] ?? "");
    if (r) r.ideas++;
  });
  D.initiatives.forEach((t) => t.members.forEach((m) => {
    const r = person(m.name, /^proposed/.test(m.role) ? "" : m.role);
    if (!r) return;
    if (t.status === "Shipped") r.shipped++;
    else if (t.status === "Awaiting decision") r.awaiting++;
    else if (t.people > 0) r.building++;
  }));
  return Object.values(tally)
    .filter((r) => (r.signals + r.ideas > 0 && !r.name.startsWith("Anonymous")) || r.name === handle)
    .sort((a, b) => b.signals + b.ideas + b.shipped - (a.signals + a.ideas + a.shipped))
    .slice(0, 5);
}

// Progress -> "Stuck the longest": waiting or unfunded ideas, longest first.
export const stalled = (D: DemoData) =>
  D.ideas.filter((i) => i.status === "Awaiting decision" || i.status === "Unfunded")
    .sort((a, b) => (b.wait || 0) - (a.wait || 0) || (a.status === "Unfunded" ? 1 : -1));

// Overview -> "Answer owed": ideas awaiting a decision, longest wait first.
export const decisionsWaiting = (D: DemoData) =>
  D.ideas.filter((i) => i.status === "Awaiting decision").sort((a, b) => b.wait - a.wait);

export type FunnelStep = { n: number; label: string; sub: string; pct: number; note: string; gate: boolean };

export function funnel(N: Counts): FunnelStep[] {
  const top = Math.max(1, N.signals);
  const w = (x: number) => Math.round((x / top) * 100);
  return [
    { n: N.signals, label: "Said out loud", sub: "quotes kept from interviews and the app", pct: w(N.signals), note: "", gate: false },
    { n: N.problems, label: "Clustered into root problems", sub: "duplicates merged, named plainly", pct: w(N.problems), note: "", gate: false },
    { n: N.ideas, label: "Answered with an idea", sub: "employees proposed the fix themselves", pct: w(N.ideas), note: "", gate: false },
    { n: N.funded, label: "Given a team and a budget", sub: N.ideas - N.funded + " ideas stopped here", pct: w(N.funded),
      note: "This is the hierarchy gate. It is the narrowest point in the system and the only one leadership controls directly.", gate: true },
    { n: N.shippedIdeas, label: "Shipped", sub: N.funded - N.shippedIdeas + " still in trial or being built", pct: w(N.shippedIdeas), note: "", gate: false },
  ];
}

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
