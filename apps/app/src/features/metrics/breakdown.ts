// The unit and role breakdown (MET D11) under small-group suppression (D6). Pure.
// Primary: a row under MIN_GROUP people is hidden. Complementary: a parent's roll-up includes its hidden child,
// so when exactly one child of a parent is hidden a viewer could subtract the visible siblings and rebuild it.
// Then the smallest visible sibling is hidden too, or the parent when it has none. The company tiles stand in
// for the roll-up of the root units. A hidden row still counts in its parent.
import { onTimeOf, reasonedWaitOf, unitSubtree } from "./ledger";
import { MIN_GROUP, type BreakdownRow, type LedgerCase, type LedgerInput, type MetricsUnit, type Period } from "./types";

type Figures = Pick<BreakdownRow, "cases" | "firstReasonedAnswer" | "onTimePct" | "pastPromise" | "escalated" | "stalled">;

const HIDDEN_FIGURES: Figures = { cases: null, firstReasonedAnswer: null, onTimePct: null, pastPromise: null, escalated: null, stalled: null };

function figures(cases: LedgerCase[], input: LedgerInput, p: Period, stalled: number | null = null): Figures {
  const raised = cases.filter((c) => c.raisedDay >= p.from && c.raisedDay <= p.to);
  const open = cases.filter((c) => c.open);
  return {
    cases: raised.length,
    firstReasonedAnswer: reasonedWaitOf(raised).value,
    onTimePct: onTimeOf(raised, input.promiseDays, input.today).value,
    pastPromise: p.to === input.today ? open.filter((c) => c.dueDay < input.today).length : null,
    escalated: cases.filter((c) => c.escalatedDay !== null && c.escalatedDay >= p.from && c.escalatedDay <= p.to).length,
    stalled,
  };
}

function unitRows(input: LedgerInput, p: Period): BreakdownRow[] {
  const units = input.org.units;
  const known = new Set(units.map((u) => u.id));
  const parentOf = (u: MetricsUnit): string | null => (u.parentId !== null && known.has(u.parentId) ? u.parentId : null);
  const childrenOf = (parent: string | null) => units.filter((u) => parentOf(u) === parent);

  const primary = new Set(units.filter((u) => u.people < MIN_GROUP).map((u) => u.id));
  const hidden = new Set(primary);
  for (const parent of new Set(units.filter((u) => primary.has(u.id)).map(parentOf))) {
    const kids = childrenOf(parent);
    if (kids.filter((k) => primary.has(k.id)).length !== 1) continue;
    const visible = kids.filter((k) => !primary.has(k.id)).sort((a, b) => a.people - b.people);
    if (visible.length > 0) hidden.add(visible[0].id);
    else if (parent !== null) hidden.add(parent);
  }

  const rows: BreakdownRow[] = [];
  const walk = (u: MetricsUnit, depth: number) => {
    const ids = unitSubtree(input, u.id);
    const rolled = input.cases.filter((c) => c.unitId !== null && ids.has(c.unitId));
    const isHidden = hidden.has(u.id);
    // Stalled projects stand today, so only the current period has a number; a unit counts the ones of its whole subtree (plan RES, D22).
    const stalled = p.to === input.today ? input.stalled.filter((s) => s.unitId !== null && ids.has(s.unitId)).length : null;
    rows.push({ kind: "unit", id: u.id, label: u.name, depth, hidden: isHidden, ...(isHidden ? HIDDEN_FIGURES : figures(rolled, input, p, stalled)) });
    childrenOf(u.id).forEach((k) => walk(k, depth + 1));
  };
  childrenOf(null).forEach((u) => walk(u, 0));
  return rows;
}

function roleRows(input: LedgerInput, p: Period): BreakdownRow[] {
  return input.org.roles.map((r) => {
    const isHidden = r.people < MIN_GROUP;
    const desk = input.cases.filter((c) => c.roleId === r.id);
    return { kind: "role", id: r.id, label: r.title, depth: 0, hidden: isHidden, ...(isHidden ? HIDDEN_FIGURES : figures(desk, input, p)) };
  });
}

export function breakdown(input: LedgerInput, period: Period, kind: "unit" | "role"): BreakdownRow[] {
  return kind === "unit" ? unitRows(input, period) : roleRows(input, period);
}
