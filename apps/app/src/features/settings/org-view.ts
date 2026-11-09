// What the Org settings page shows about the structure: the summary line, the unit tree with a
// search, and which units have a vacant seat. Pure: Knowledge in, plain values out.
import type { Knowledge, UnitRow } from "@/features/knowledge";

export type TreeRow = { unit: UnitRow; depth: number; hasChildren: boolean };

/** Units in tree order with their depth; units whose parent is missing start a tree of their own. */
export function unitTree(units: readonly UnitRow[]): TreeRow[] {
  const ids = new Set(units.map((u) => u.id));
  const kids = (id: string) => units.filter((c) => c.parentId === id).sort((a, b) => a.sort - b.sort);
  const out: TreeRow[] = [];
  const seen = new Set<string>();
  const walk = (u: UnitRow, depth: number) => {
    if (seen.has(u.id)) return;
    seen.add(u.id);
    out.push({ unit: u, depth, hasChildren: kids(u.id).length > 0 });
    kids(u.id).forEach((c) => walk(c, depth + 1));
  };
  units.filter((u) => !u.parentId || !ids.has(u.parentId)).sort((a, b) => a.sort - b.sort).forEach((u) => walk(u, 0));
  units.forEach((u) => walk(u, 0)); // units caught in a parent loop
  return out;
}

/**
 * The rows to show: with a query, the matching units and their ancestors; without one, every unit
 * whose ancestors are all open.
 */
export function visibleRows(rows: readonly TreeRow[], units: readonly UnitRow[], open: ReadonlySet<string>, query: string): TreeRow[] {
  const byId = new Map(units.map((u) => [u.id, u]));
  const ancestors = (u: UnitRow): string[] => {
    const out: string[] = [];
    for (let p = u.parentId; p && byId.has(p) && !out.includes(p); p = byId.get(p)?.parentId ?? null) out.push(p);
    return out;
  };
  const q = query.trim().toLowerCase();
  if (q) {
    const keep = new Set<string>();
    for (const r of rows) if (r.unit.name.toLowerCase().includes(q) || r.unit.key.toLowerCase().includes(q)) [r.unit.id, ...ancestors(r.unit)].forEach((id) => keep.add(id));
    return rows.filter((r) => keep.has(r.unit.id));
  }
  return rows.filter((r) => ancestors(r.unit).every((id) => open.has(id)));
}

export type OrgSummary = { units: number; roles: number; vacantSeats: number };

export function orgSummary(k: Knowledge): OrgSummary {
  return { units: k.units.length, roles: k.roles.length, vacantSeats: k.holders.filter((h) => h.userId === null).length };
}

/** Units with at least one role that has a seat nobody is linked to. */
export function unitsWithVacancy(k: Knowledge): Set<string> {
  const unitOf = new Map(k.roles.map((r) => [r.id, r.orgUnitId]));
  return new Set(k.holders.filter((h) => h.userId === null).map((h) => unitOf.get(h.roleId)).filter((u): u is string => Boolean(u)));
}

/**
 * How many active people each unit has, its sub-units included: the people on its seats and the members whose
 * department names it, each once (features/cases/stamp.ts unitPeople, as the metrics count). Members hold no
 * seat, so a seat count would show a unit of 90 as 2; this counts people.
 */
export function peoplePerUnit(units: readonly Pick<UnitRow, "id">[], ofUnit: (unitId: string) => number): Record<string, number> {
  return Object.fromEntries(units.map((u) => [u.id, ofUnit(u.id)]));
}
