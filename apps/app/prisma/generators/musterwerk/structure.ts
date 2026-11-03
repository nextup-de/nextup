// Musterwerk's org: 3 sites (top-level units; there is no Site model), departments and teams below,
// a leader seat and a deputy seat for every department, a lead seat for every production team, and a
// route for every case type with an owner and a deputy role. Written with writeStructure (D5).
import type { GoalRow, HolderRow, Knowledge, RoleRow, RuleRow, UnitRow } from "../../../src/features/knowledge";
import { nameAt, namePermutation } from "./names";
import type { Rng } from "./rng";

type DeptDef = { key: string; name: string; weight: number; teams?: readonly { key: string; name: string }[] };

const PRODUCTION_TEAMS = [{ key: "a", name: "Linie A" }, { key: "b", name: "Linie B" }] as const;

const SITES: readonly { key: string; name: string; head: string; depts: readonly DeptDef[] }[] = [
  {
    key: "nord", name: "Werk Nord", head: "Werkleiter Nord",
    depts: [
      { key: "production", name: "Produktion", weight: 6, teams: PRODUCTION_TEAMS },
      { key: "quality", name: "Qualität", weight: 1.5 },
      { key: "maintenance", name: "Instandhaltung", weight: 1.5 },
      { key: "logistics", name: "Logistik", weight: 2 },
    ],
  },
  {
    key: "sued", name: "Werk Süd", head: "Werkleiter Süd",
    depts: [
      { key: "production", name: "Produktion", weight: 6, teams: PRODUCTION_TEAMS },
      { key: "quality", name: "Qualität", weight: 1.5 },
      { key: "maintenance", name: "Instandhaltung", weight: 1.5 },
      { key: "logistics", name: "Logistik", weight: 2 },
      { key: "engineering", name: "Entwicklung", weight: 1.5 },
    ],
  },
  {
    key: "zentrale", name: "Zentrale", head: "",
    depts: [
      { key: "hr", name: "Personal", weight: 0.6 },
      { key: "finance", name: "Finanzen", weight: 0.8 },
      { key: "it", name: "IT", weight: 0.8 },
      { key: "purchasing", name: "Einkauf", weight: 0.8 },
      { key: "engineering", name: "Entwicklung", weight: 1.2 },
    ],
  },
];

/** The title prefixes decide the login role of the person in the seat (people.ts). */
export function roleLevel(title: string): "manager" | "leader" {
  return /^(Geschäftsführer|Werkleiter|Leiter )/.test(title) ? "manager" : "leader";
}

/** A route per case type: [key, type, keywords, owner role title, deputy role title]. */
const ROUTES: readonly (readonly [string, string, readonly string[], string, string])[] = [
  ["maintenance", "Machine or equipment defect", ["defekt", "maschine", "ausfall", "reparatur", "broken"], "Leiter Instandhaltung Werk Nord", "Stellv. Leiter Instandhaltung Werk Nord"],
  ["quality", "Quality issue", ["qualität", "ausschuss", "reklamation", "scrap"], "Leiter Qualität Werk Süd", "Stellv. Leiter Qualität Werk Süd"],
  ["safety", "Safety concern", ["sicherheit", "unfall", "gefahr", "safety"], "Werkleiter Nord", "Werkleiter Süd"],
  ["material", "Material shortage", ["material", "lager", "lieferung", "shortage"], "Leiter Logistik Werk Nord", "Stellv. Leiter Logistik Werk Nord"],
  ["it", "IT problem", ["it", "software", "passwort", "netzwerk", "login"], "Leiter IT Zentrale", "Stellv. Leiter IT Zentrale"],
  ["hr", "HR question", ["urlaub", "schicht", "vertrag", "personal"], "Leiter Personal Zentrale", "Stellv. Leiter Personal Zentrale"],
  ["purchasing", "Purchase request", ["bestellung", "einkauf", "lieferant", "purchase"], "Leiter Einkauf Zentrale", "Stellv. Leiter Einkauf Zentrale"],
  ["process", "Process improvement", ["prozess", "verbesserung", "idee", "ablauf"], "Leiter Produktion Werk Süd", "Stellv. Leiter Produktion Werk Süd"],
  ["budget", "Budget or expense", ["budget", "kosten", "freigabe", "spend"], "Leiter Finanzen Zentrale", "Stellv. Leiter Finanzen Zentrale"],
  ["tooling", "Design or tooling change", ["konstruktion", "werkzeug", "zeichnung", "tooling"], "Leiter Entwicklung Werk Süd", "Stellv. Leiter Entwicklung Werk Süd"],
];

/** The people a structure needs for its seats, at least. */
export const MIN_PEOPLE = 40;

/** Largest-remainder split of `total` by weight, so the parts add up exactly. */
function split(total: number, weights: readonly number[]): number[] {
  const sum = weights.reduce((a, b) => a + b, 0);
  const raw = weights.map((w) => (w / sum) * total);
  const out = raw.map(Math.floor);
  let left = total - out.reduce((a, b) => a + b, 0);
  raw
    .map((r, i) => [r - Math.floor(r), i] as const)
    .sort((a, b) => b[0] - a[0] || a[1] - b[1])
    .forEach(([, i]) => {
      if (left > 0) {
        out[i]++;
        left--;
      }
    });
  return out;
}

/**
 * The structure for `people` employees. Seat holders carry the names of the first people of the name
 * order; people.ts gives them users (same order, same seed) and sets `holders[].userId`.
 * `idPrefix` makes every primary key unique across companies (use the slug).
 */
export function musterwerkStructure(rng: Rng, people: number, idPrefix = "mw"): Knowledge {
  if (people < MIN_PEOPLE) throw new Error(`Musterwerk needs at least ${MIN_PEOPLE} people for its seats, got ${people}`);
  const order = namePermutation(rng);
  let nameIx = 0;
  const units: UnitRow[] = [];
  const roles: RoleRow[] = [];
  const holders: HolderRow[] = [];
  const n = { u: 0, r: 0, h: 0 };

  const unit = (key: string, name: string, kind: string, parentId: string | null): UnitRow => {
    const u: UnitRow = { id: `${idPrefix}-u${n.u++}`, key, name, kind, headcount: 0, parentId, sort: units.length };
    units.push(u);
    return u;
  };
  /** A role with exactly one holder: a seat. */
  const seat = (unitRow: UnitRow, title: string, reportsToId: string | null): RoleRow => {
    const role: RoleRow = { id: `${idPrefix}-r${n.r++}`, orgUnitId: unitRow.id, title, reportsToId, decides: [], spendLimitEur: null, skills: [], sort: roles.length };
    roles.push(role);
    const { first, last } = nameAt(order, nameIx++);
    holders.push({ id: `${idPrefix}-h${n.h++}`, roleId: role.id, name: `${first} ${last}`, userId: null, sort: holders.length });
    return role;
  };

  const zentrale = SITES[2];
  const zUnit = unit(zentrale.key, zentrale.name, "dept", null);
  const gf = seat(zUnit, "Geschäftsführer", null);

  const leaves: { unit: UnitRow; weight: number }[] = [];
  for (const site of SITES) {
    const siteUnit = site.key === zentrale.key ? zUnit : unit(site.key, site.name, "dept", null);
    const siteHead = site.head ? seat(siteUnit, site.head, gf.id) : gf;
    for (const d of site.depts) {
      const dept = unit(`${site.key}-${d.key}`, d.name, "dept", siteUnit.id);
      const suffix = ` ${d.name} ${site.name}`;
      const head = seat(dept, `Leiter${suffix}`, siteHead.id);
      seat(dept, `Stellv. Leiter${suffix}`, head.id);
      if (d.teams) {
        for (const t of d.teams) {
          const team = unit(`${site.key}-${d.key}-${t.key}`, `${d.name} ${t.name}`, "team", dept.id);
          seat(team, `Schichtleiter ${d.name} ${t.name} ${site.name}`, head.id);
          leaves.push({ unit: team, weight: d.weight / d.teams.length });
        }
      } else {
        leaves.push({ unit: dept, weight: d.weight });
      }
    }
  }

  // Headcount: every seat is a person, the rest of `people` is spread over the leaf units by weight.
  const seatsInUnit = new Map<string, number>();
  for (const r of roles) seatsInUnit.set(r.orgUnitId, (seatsInUnit.get(r.orgUnitId) ?? 0) + 1);
  const members = split(people - holders.length, leaves.map((l) => l.weight));
  const direct = new Map(leaves.map((l, i) => [l.unit.id, members[i]] as const));
  const total = new Map<string, number>();
  const sum = (u: UnitRow): number => {
    let s = (direct.get(u.id) ?? 0) + (seatsInUnit.get(u.id) ?? 0);
    for (const c of units.filter((x) => x.parentId === u.id)) s += sum(c);
    total.set(u.id, s);
    return s;
  };
  units.filter((u) => u.parentId === null).forEach(sum);
  for (const u of units) u.headcount = total.get(u.id) ?? 0;

  const roleByTitle = new Map(roles.map((r) => [r.title, r]));
  const rules: RuleRow[] = ROUTES.map(([key, type, keywords, owner, deputy], i) => {
    const o = roleByTitle.get(owner);
    const dep = roleByTitle.get(deputy);
    if (!o || !dep) throw new Error(`route ${key}: no role "${o ? deputy : owner}"`);
    return { id: `${idPrefix}-q${i}`, key, type, keywords: [...keywords], ownerRoleId: o.id, deputyRoleId: dep.id, buddyRoleId: null, wait: "5 d", sort: i };
  });
  const goals: GoalRow[] = [];
  return { units, roles, holders, rules, goals };
}
