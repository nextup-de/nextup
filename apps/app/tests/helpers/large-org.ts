// A made-up company of a size the demo never reaches, for tests and for looking at the Data page
// at scale: about `people` employees in divisions, departments and teams, a role tree under each
// team lead, and a routing table that is deliberately a little broken (missing deputies, an owner
// role nobody holds). Deterministic: the same arguments give the same rows.
import type { GoalRow, HolderRow, Knowledge, RoleRow, RuleRow, UnitRow } from "@/features/knowledge";

const rng = (seed: number) => () => ((seed = (seed * 1664525 + 1013904223) >>> 0) / 2 ** 32);

export function largeOrg(people = 500, seed = 7): Knowledge {
  const rand = rng(seed);
  const pick = (n: number) => Math.floor(rand() * n);
  const units: UnitRow[] = [];
  const roles: RoleRow[] = [];
  const holders: HolderRow[] = [];
  let n = 0;
  const id = (p: string) => `${p}${++n}`;

  const unit = (name: string, kind: string, headcount: number, parentId: string | null): UnitRow => {
    const u: UnitRow = { id: id("u"), key: name.slice(0, 3).toUpperCase() + units.length, name, kind, headcount, parentId, sort: units.length };
    units.push(u);
    return u;
  };
  const role = (u: UnitRow, title: string, boss: RoleRow | null, held: number): RoleRow => {
    const r: RoleRow = { id: id("r"), orgUnitId: u.id, title, reportsToId: boss?.id ?? null, decides: [], spendLimitEur: null, skills: [], sort: roles.length };
    roles.push(r);
    for (let i = 0; i < held; i++) holders.push({ id: id("h"), roleId: r.id, name: `Person ${holders.length + 1}`, userId: null, sort: holders.length });
    return r;
  };

  const divisions = ["Production", "Engineering", "Quality", "Logistics", "Finance", "Sales"];
  const perDivision = Math.round(people / divisions.length);
  const ceo = role(unit("Board", "board", 5, null), "CEO", null, 1);

  for (const d of divisions) {
    const division = unit(d, "dept", perDivision, null);
    const head = role(division, `Head of ${d}`, ceo, 1);
    const teams = Math.max(3, Math.ceil(perDivision / 14));
    for (let t = 1; t <= teams; t++) {
      const size = Math.round(perDivision / teams);
      const team = unit(`${d} team ${t}`, "team", size, division.id);
      const lead = role(team, `${d} lead ${t}`, head, 1);
      const kinds = 3 + pick(4);
      for (let c = 1; c <= kinds; c++) {
        const sub = role(team, `${d} specialist ${t}.${c}`, lead, Math.max(1, Math.round(size / kinds) - 1));
        if (rand() < 0.2) role(team, `${d} trainee ${t}.${c}`, sub, 0); // a role nobody holds yet
      }
    }
  }

  const rules: RuleRow[] = Array.from({ length: 40 }, (_, i) => {
    const owner = roles[pick(roles.length)];
    const other = () => roles[pick(roles.length)].id;
    const gap = rand();
    return {
      id: id("q"), key: `R${i + 1}`, type: `Request type ${i + 1}`, keywords: [`kw${i}`],
      ownerRoleId: gap < 0.05 ? "missing-role" : owner.id,
      deputyRoleId: gap > 0.8 ? null : other(),
      buddyRoleId: gap > 0.9 ? null : other(),
      wait: "2 days", sort: i,
    };
  });

  const goals: GoalRow[] = ["Cut lead time", "Reduce scrap", "Raise on-time delivery"].map((title, i) => ({
    id: id("g"), orgUnitId: null, parentId: null, title, kpi: "", target: "", period: "", keywords: [], sort: i,
  }));

  return { units, roles, holders, rules, goals };
}
