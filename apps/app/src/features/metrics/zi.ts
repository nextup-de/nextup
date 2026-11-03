// The ZI report (MET D13): per unit and for the company, for a period. Pure; counts only, never per person (D2).
// Ideas drive participation, ideas per 100 and the decision median. Implementation is read from the projects
// decided in the period; verified outcomes and premiums from the projects finished in the period.
import { median } from "./index";
import { MIN_GROUP, type KpiProject, type LedgerCase, type MetricsOrg, type MetricsUnit, type Period, type ZiRow } from "./types";

type Node = { unit: MetricsUnit; depth: number; parent: number | null; members: Set<string>; kids: number[] };

const round = (n: number, digits = 0) => Math.round(n * 10 ** digits) / 10 ** digits;

function hiddenRow(unitId: string | null, label: string, depth: number): ZiRow {
  return {
    unitId, label, depth, headcount: 0, participationPct: null, ideasPer100: null, implementationPct: null,
    medianDaysToDecision: null, savingsEur: null, energyKwh: null, co2Kg: null, premiumsEur: null, hidden: true,
  };
}

/** Units in tree order. A unit whose parent is missing counts as a root. */
function buildTree(org: MetricsOrg): { nodes: Node[]; roots: number[] } {
  const known = new Set(org.units.map((u) => u.id));
  const byParent = new Map<string | null, MetricsUnit[]>();
  for (const u of org.units) {
    const key = u.parentId !== null && u.parentId !== u.id && known.has(u.parentId) ? u.parentId : null;
    byParent.set(key, [...(byParent.get(key) ?? []), u]);
  }
  const nodes: Node[] = [];
  const roots: number[] = [];
  const walk = (u: MetricsUnit, depth: number, parent: number | null): Set<string> => {
    const index = nodes.length;
    const node: Node = { unit: u, depth, parent, members: new Set([u.id]), kids: [] };
    nodes.push(node);
    if (parent === null) roots.push(index);
    else nodes[parent].kids.push(index);
    for (const child of byParent.get(u.id) ?? []) {
      if (nodes.some((n) => n.unit.id === child.id)) continue; // cycle guard
      for (const id of walk(child, depth + 1, index)) node.members.add(id);
    }
    return node.members;
  };
  for (const u of byParent.get(null) ?? []) walk(u, 0, null);
  return { nodes, roots };
}

/** Configured headcount of a set of units, rolled up when above 0, else the seated people. */
function headcountOf(units: MetricsUnit[]): number {
  const configured = units.reduce((a, u) => a + u.headcount, 0);
  return configured > 0 ? configured : units.reduce((a, u) => a + u.people, 0);
}

export function ziKpis(input: { cases: LedgerCase[]; projects: KpiProject[]; org: MetricsOrg; period: Period }): {
  company: ZiRow;
  units: ZiRow[];
} {
  const { cases, projects, org, period } = input;
  const inPeriod = (d: number | null): d is number => d !== null && d >= period.from && d <= period.to;
  const ideas = cases.filter((c) => c.kind === "idea");
  const raised = ideas.filter((c) => inPeriod(c.raisedDay));
  const decided = ideas.filter((c) => inPeriod(c.decidedDay));
  const decidedProjects = projects.filter((p) => inPeriod(p.decidedDay));
  const finishedProjects = projects.filter((p) => inPeriod(p.doneDay));

  const { nodes, roots } = buildTree(org);

  type Computed = { row: ZiRow; raisers: number };
  const compute = (inScope: (unitId: string | null) => boolean, units: MetricsUnit[], unitId: string | null, label: string, depth: number): Computed => {
    const headcount = headcountOf(units);
    const mine = raised.filter((c) => inScope(c.raiserUnitId));
    const raisers = new Set(mine.flatMap((c) => (c.raiserKey === null ? [] : [c.raiserKey]))).size;
    if (raisers < MIN_GROUP || headcount < MIN_GROUP) return { row: hiddenRow(unitId, label, depth), raisers };

    const days = decided.filter((c) => inScope(c.raiserUnitId)).map((c) => c.decidedDay! - c.raisedDay);
    const decidedHere = decidedProjects.filter((p) => inScope(p.raiserUnitId));
    const finished = finishedProjects.filter((p) => inScope(p.raiserUnitId));
    const good = finished.flatMap((p) => p.measures.filter((m) => m.verified && m.better));
    const sum = (pick: (m: (typeof good)[number]) => number | null) =>
      finished.length === 0 ? null : good.reduce((a, m) => a + (pick(m) ?? 0), 0);
    return {
      raisers,
      row: {
        unitId, label, depth, headcount,
        participationPct: round((raisers / headcount) * 100),
        ideasPer100: round((mine.length / headcount) * 100, 1),
        implementationPct: decidedHere.length === 0 ? null : round((decidedHere.filter((p) => inPeriod(p.doneDay)).length / decidedHere.length) * 100),
        medianDaysToDecision: median(days),
        savingsEur: sum((m) => m.eur),
        energyKwh: sum((m) => m.kwh),
        co2Kg: sum((m) => m.co2Kg),
        premiumsEur: finished.length === 0 ? null : finished.reduce((a, p) => a + p.premiumsEur, 0),
        hidden: false,
      },
    };
  };

  const computed = nodes.map((n) =>
    compute((id) => id !== null && n.members.has(id), org.units.filter((u) => n.members.has(u.id)), n.unit.id, n.unit.name, n.depth),
  );
  const company = compute(() => true, org.units, null, "", 0);

  // Complementary suppression: a visible total with exactly one hidden child would give that child away
  // (total minus the visible siblings). Hide one more sibling and its subtree, or the parent when none is left.
  const hidden = computed.map((c) => c.row.hidden);
  let companyHidden = company.row.hidden;
  const hideSubtree = (i: number) => {
    hidden[i] = true;
    for (const k of nodes[i].kids) hideSubtree(k);
  };
  for (let changed = true; changed; ) {
    changed = false;
    const groups: { parent: number | null; kids: number[] }[] = [{ parent: null, kids: roots }, ...nodes.map((n, i) => ({ parent: i, kids: n.kids }))];
    for (const { parent, kids } of groups) {
      if (parent === null ? companyHidden : hidden[parent]) continue;
      if (kids.filter((k) => hidden[k]).length !== 1) continue;
      const visible = kids.filter((k) => !hidden[k]);
      if (visible.length > 0) {
        const pick = [...visible].sort(
          (a, b) => computed[a].raisers - computed[b].raisers || computed[a].row.headcount - computed[b].row.headcount || a - b,
        )[0];
        hideSubtree(pick);
      } else if (parent === null) companyHidden = true;
      else hidden[parent] = true;
      changed = true;
    }
  }

  return {
    company: companyHidden ? hiddenRow(null, "", 0) : company.row,
    units: computed.map((c, i) => (hidden[i] ? hiddenRow(nodes[i].unit.id, nodes[i].unit.name, nodes[i].depth) : c.row)),
  };
}
