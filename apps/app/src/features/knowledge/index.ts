// Company knowledge as rows: org units, roles, who holds them, the routing table, goals.
// docs/COMPANY_KNOWLEDGE.md. Pure - no database, no Next. src/lib/db/knowledge.ts reads and
// writes these shapes; this file converts between them and the `Seed` the pages already read.
//
// Two directions:
//   rowsFromSeed  Seed.depts/people/routes (+ goals) -> rows. Used to fill the tables for a
//                 company that so far lived in seedJson (prisma/seed.ts, the admin template).
//   seedParts     rows -> Seed.depts/people/routes, so reduce(seed, log) and every page keep
//                 working while the tables become the source of truth.
//
// The structure is between ROLES; a person is only ever a holder's name. Two people with the
// same title in the same unit under the same boss are one role with two holders ("Line 3").
import type { Dept, OrgPerson, Route, Seed } from "@/features/demo/types";

export type UnitRow = { id: string; key: string; name: string; kind: string; headcount: number; parentId: string | null; sort: number };
export type RoleRow = {
  id: string; orgUnitId: string; title: string; reportsToId: string | null;
  decides: string[]; spendLimitEur: number | null; skills: string[]; sort: number;
};
export type HolderRow = { id: string; roleId: string; name: string; userId: string | null; sort: number };
export type RuleRow = {
  id: string; key: string; type: string; keywords: string[];
  ownerRoleId: string; deputyRoleId: string | null; buddyRoleId: string | null; wait: string; sort: number;
};
export type GoalRow = {
  id: string; orgUnitId: string | null; parentId: string | null;
  title: string; kpi: string; target: string; period: string; keywords: string[]; sort: number;
};
export type Knowledge = { units: UnitRow[]; roles: RoleRow[]; holders: HolderRow[]; rules: RuleRow[]; goals: GoalRow[] };

/** The keyword goals features/evaluate matches against today. */
export type KeywordGoal = { goal: string; keys: string[] };

export const NO_KNOWLEDGE: Knowledge = { units: [], roles: [], holders: [], rules: [], goals: [] };

/** A company has moved to the tables once it has at least one org unit. */
export const hasKnowledge = (k: Knowledge) => k.units.length > 0;

/** Seed -> rows. `newId` mints primary keys (cuid-like in the app, a counter in tests). */
export function rowsFromSeed(seed: Pick<Seed, "depts" | "people" | "routes">, goals: readonly KeywordGoal[], newId: () => string): Knowledge {
  const units: UnitRow[] = [];
  const unitByKey = new Map<string, UnitRow>();
  const unit = (key: string, name = key): UnitRow => {
    let u = unitByKey.get(key);
    if (!u) {
      u = { id: newId(), key, name, kind: "dept", headcount: 0, parentId: null, sort: units.length };
      units.push(u);
      unitByKey.set(key, u);
    }
    return u;
  };
  seed.depts.forEach((d: Dept) => { unit(d.id, d.name).headcount = d.people; });

  const roles: RoleRow[] = [];
  const holders: HolderRow[] = [];
  const roleByShape = new Map<string, RoleRow>();
  const roleOfPerson = new Map<string, RoleRow>();
  const hold = (role: RoleRow, name: string) => {
    holders.push({ id: newId(), roleId: role.id, name, userId: null, sort: holders.length });
    roleOfPerson.set(name, role);
  };
  const role = (dept: string, title: string, shape: string): RoleRow => {
    let r = roleByShape.get(shape);
    if (!r) {
      r = { id: newId(), orgUnitId: unit(dept).id, title, reportsToId: null, decides: [], spendLimitEur: null, skills: [], sort: roles.length };
      roles.push(r);
      roleByShape.set(shape, r);
    }
    return r;
  };

  // Pass 1: one role per (unit, title, boss). Pass 2: link each role to its boss's role.
  seed.people.forEach((p: OrgPerson) => hold(role(p.dept, p.role, [p.dept, p.role, p.reportsTo ?? ""].join("|")), p.name));
  seed.people.forEach((p) => {
    const boss = p.reportsTo ? roleOfPerson.get(p.reportsTo) : undefined;
    if (boss) roleOfPerson.get(p.name)!.reportsToId = boss.id;
  });

  // A name the org chart does not know still has to land somewhere: a role of its own.
  const roleFor = (name: string, dept: string, title = ""): RoleRow => {
    const known = roleOfPerson.get(name);
    if (known) return known;
    const r = role(dept, title, "?" + name);
    hold(r, name);
    return r;
  };
  const deptKeyByName = (name: string) => seed.depts.find((d) => d.name === name)?.id ?? name;

  const rules: RuleRow[] = seed.routes.map((r: Route, i) => {
    const [buddyName, buddyDept] = r.buddy.split(" · ");
    return {
      id: newId(), key: r.id, type: r.type, keywords: [...r.keys],
      ownerRoleId: roleFor(r.owner.name, r.owner.dept, r.owner.role).id,
      deputyRoleId: r.deputy ? roleFor(r.deputy, r.owner.dept).id : null,
      buddyRoleId: buddyName ? roleFor(buddyName, deptKeyByName(buddyDept ?? "")).id : null,
      wait: r.wait, sort: i,
    };
  });

  const goalRows: GoalRow[] = goals.map((g, i) => ({
    id: newId(), orgUnitId: null, parentId: null, title: g.goal, kpi: "", target: "", period: "", keywords: [...g.keys], sort: i,
  }));

  return { units, roles, holders, rules, goals: goalRows };
}

/** Rows -> the three Seed collections they replace. */
export function seedParts(k: Knowledge): Pick<Seed, "depts" | "people" | "routes"> {
  const bySort = <T extends { sort: number }>(xs: readonly T[]) => [...xs].sort((a, b) => a.sort - b.sort);
  const unitById = new Map(k.units.map((u) => [u.id, u]));
  const roleById = new Map(k.roles.map((r) => [r.id, r]));
  const holdersOf = new Map<string, HolderRow[]>();
  for (const h of bySort(k.holders)) holdersOf.set(h.roleId, [...(holdersOf.get(h.roleId) ?? []), h]);

  // A role with several holders answers to its first; that is who the case lands with.
  const firstHolder = (roleId: string | null) => (roleId ? holdersOf.get(roleId)?.[0]?.name ?? "" : "");
  const unitOf = (roleId: string | null) => {
    const r = roleId ? roleById.get(roleId) : undefined;
    return r ? unitById.get(r.orgUnitId) : undefined;
  };

  const depts: Dept[] = bySort(k.units).map((u) => ({ id: u.key, name: u.name, people: u.headcount }));

  const people: OrgPerson[] = bySort(k.holders).flatMap((h) => {
    const r = roleById.get(h.roleId);
    if (!r || !r.title) return []; // a stand-in role made for a name the org chart did not have
    return [{ name: h.name, role: r.title, dept: unitById.get(r.orgUnitId)?.key ?? "", reportsTo: firstHolder(r.reportsToId) || null }];
  });

  const routes: Route[] = bySort(k.rules).map((rule) => {
    const owner = roleById.get(rule.ownerRoleId);
    const buddy = firstHolder(rule.buddyRoleId);
    return {
      id: rule.key, type: rule.type, keys: [...rule.keywords],
      owner: { name: firstHolder(rule.ownerRoleId), role: owner?.title ?? "", dept: unitOf(rule.ownerRoleId)?.key ?? "" },
      deputy: firstHolder(rule.deputyRoleId),
      buddy: buddy ? buddy + " · " + (unitOf(rule.buddyRoleId)?.name ?? "") : "",
      wait: rule.wait,
    };
  });

  return { depts, people, routes };
}

/** The Seed the pages read: seedJson, with the tables laid over it once the company has them. */
export function overlayKnowledge(seed: Seed, k: Knowledge): Seed {
  return hasKnowledge(k) ? { ...seed, ...seedParts(k) } : seed;
}

export type Profile = { vision: string; mission: string; principles: string[]; businessModel: string };

export type RoleNode = { role: RoleRow; unit: string; holders: string[]; depth: number };

/** Roles in org-chart order: each boss, then everyone under them. Roles in a loop come last. */
export function roleTree(k: Knowledge): RoleNode[] {
  const unitName = new Map(k.units.map((u) => [u.id, u.name]));
  const byBoss = new Map<string | null, RoleRow[]>();
  for (const r of [...k.roles].sort((a, b) => a.sort - b.sort)) byBoss.set(r.reportsToId, [...(byBoss.get(r.reportsToId) ?? []), r]);
  const ids = new Set(k.roles.map((r) => r.id));
  const out: RoleNode[] = [];
  const seen = new Set<string>();
  const walk = (r: RoleRow, depth: number) => {
    if (seen.has(r.id)) return;
    seen.add(r.id);
    const holders = k.holders.filter((h) => h.roleId === r.id).sort((a, b) => a.sort - b.sort).map((h) => h.name);
    out.push({ role: r, unit: unitName.get(r.orgUnitId) ?? "", holders, depth });
    for (const c of byBoss.get(r.id) ?? []) walk(c, depth + 1);
  };
  // Tops: no boss, or a boss that is not in the table.
  for (const r of k.roles.filter((x) => !x.reportsToId || !ids.has(x.reportsToId)).sort((a, b) => a.sort - b.sort)) walk(r, 0);
  for (const r of k.roles) walk(r, 0);
  return out;
}

/**
 * What a model is given about the company: profile, units, the role tree, the routing table and
 * the goals, as plain text. No names - roles only (docs/INTEGRATIONS.md). Deterministic, so the
 * same knowledge gives the same text and the text can be cached and hashed.
 */
export function companyBrief(k: Knowledge, profile: Profile | null): string {
  const unitName = new Map(k.units.map((u) => [u.id, u.name]));
  const roleById = new Map(k.roles.map((r) => [r.id, r]));
  const roleLabel = (id: string | null) => {
    const r = id ? roleById.get(id) : undefined;
    return r ? `${r.title || "unnamed role"} (${unitName.get(r.orgUnitId) ?? "?"})` : "none";
  };
  const lines: string[] = [];

  if (profile && (profile.vision || profile.mission || profile.businessModel || profile.principles.length)) {
    lines.push("## Profile");
    if (profile.vision) lines.push("Vision: " + profile.vision);
    if (profile.mission) lines.push("Mission: " + profile.mission);
    if (profile.businessModel) lines.push("Business model: " + profile.businessModel);
    for (const p of profile.principles) lines.push("Principle: " + p);
    lines.push("");
  }

  lines.push("## Units");
  for (const u of [...k.units].sort((a, b) => a.sort - b.sort)) lines.push(`- ${u.name} [${u.key}], ${u.headcount} people`);

  lines.push("", "## Roles (indented under the role they report to)");
  for (const n of roleTree(k)) {
    if (!n.role.title) continue;
    const extra = [
      n.role.decides.length ? "decides: " + n.role.decides.join(", ") : "",
      n.role.spendLimitEur !== null ? "spend limit €" + n.role.spendLimitEur : "",
      n.role.skills.length ? "skills: " + n.role.skills.join(", ") : "",
    ].filter(Boolean);
    lines.push(`${"  ".repeat(n.depth)}- ${n.role.title} (${n.unit})${extra.length ? " - " + extra.join("; ") : ""}`);
  }

  lines.push("", "## Routing table (request type -> owner · deputy · buddy)");
  for (const r of [...k.rules].sort((a, b) => a.sort - b.sort)) {
    lines.push(`- [${r.key}] ${r.type} -> ${roleLabel(r.ownerRoleId)} · ${roleLabel(r.deputyRoleId)} · ${roleLabel(r.buddyRoleId)}; keywords: ${r.keywords.join(", ")}`);
  }

  if (k.goals.length) {
    lines.push("", "## Goals");
    for (const g of [...k.goals].sort((a, b) => a.sort - b.sort)) {
      const extra = [g.kpi && "KPI " + g.kpi, g.target && "target " + g.target, g.period].filter(Boolean);
      lines.push(`- ${g.title}${g.orgUnitId ? " (" + (unitName.get(g.orgUnitId) ?? "?") + ")" : ""}${extra.length ? " - " + extra.join(", ") : ""}`);
    }
  }

  return lines.join("\n");
}
