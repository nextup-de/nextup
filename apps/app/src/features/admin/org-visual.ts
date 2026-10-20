// The Data page's pictures of a company's knowledge: a treemap of its units, its role tree cut down
// to what fits on a screen, and a health grid for the routing table. Pure and cheap: every
// function is one pass over the rows, so a 500-person company with a few hundred roles costs the
// same as the demo. Roles and counts only - a holder's name never appears in anything returned
// here (docs/COMPANY_KNOWLEDGE.md, "roles, not people").
import { roleTree, type Knowledge, type RoleRow, type UnitRow } from "@/features/knowledge";

// ── Treemap ───────────────────────────────────────────────────────────────────────────────────

export type Rect = { x: number; y: number; w: number; h: number };

/** The treemap is laid out on this canvas; the component scales it to the card's width. */
export const TREE_W = 160;
export const TREE_H = 70;

const PAD = 0.8;
const HEAD = 5;
const MAX_DEPTH = 2;

/** Squarified treemap (Bruls et al.): tiles as close to square as possible, areas proportional to weight. */
export function squarify(items: readonly { id: string; weight: number }[], rect: Rect): { id: string; rect: Rect }[] {
  const sorted = items.filter((i) => i.weight > 0).sort((a, b) => b.weight - a.weight);
  const total = sorted.reduce((n, i) => n + i.weight, 0);
  if (!total || rect.w <= 0 || rect.h <= 0) return [];
  const scale = (rect.w * rect.h) / total;
  const areas = sorted.map((i) => ({ id: i.id, area: i.weight * scale }));
  const out: { id: string; rect: Rect }[] = [];

  // The worst aspect ratio in a row laid along a side of this length.
  const worst = (row: readonly { area: number }[], side: number) => {
    const s = row.reduce((n, r) => n + r.area, 0);
    const max = Math.max(...row.map((r) => r.area));
    const min = Math.min(...row.map((r) => r.area));
    return Math.max((side * side * max) / (s * s), (s * s) / (side * side * min));
  };
  // Lays the row along the shorter side and returns what is left of the rectangle.
  const place = (row: readonly { id: string; area: number }[], r: Rect): Rect => {
    const s = row.reduce((n, x) => n + x.area, 0);
    if (r.w >= r.h) {
      const w = s / r.h;
      let y = r.y;
      for (const x of row) { const h = x.area / w; out.push({ id: x.id, rect: { x: r.x, y, w, h } }); y += h; }
      return { x: r.x + w, y: r.y, w: r.w - w, h: r.h };
    }
    const h = s / r.w;
    let x0 = r.x;
    for (const x of row) { const w = x.area / h; out.push({ id: x.id, rect: { x: x0, y: r.y, w, h } }); x0 += w; }
    return { x: r.x, y: r.y + h, w: r.w, h: r.h - h };
  };

  let rest = { ...rect };
  let row: { id: string; area: number }[] = [];
  for (const a of areas) {
    const side = Math.min(rest.w, rest.h);
    if (row.length === 0 || worst([...row, a], side) <= worst(row, side)) row.push(a);
    else { rest = place(row, rest); row = [a]; }
  }
  if (row.length) place(row, rest);
  return out;
}

/** How much a tile can say: its name and numbers, just its name, or nothing (the hover title still does). */
export type TileLabel = "full" | "short" | "none";

/** How well a unit can receive ideas: how many routing rows it owns. "group" = a unit that holds other units. */
export type TileTone = "none" | "low" | "mid" | "high" | "group";

export type UnitTile = {
  id: string;
  key: string;
  name: string;
  kind: string;
  headcount: number;
  roles: number;
  /** Roles in this unit with nobody in them. */
  vacant: number;
  /** Routing rows whose owner sits in this unit. */
  owned: number;
  depth: number;
  rect: Rect;
  label: TileLabel;
  tone: TileTone;
};

const labelFor = (r: Rect): TileLabel => (r.w >= 22 && r.h >= 12 ? "full" : r.w >= 10 && r.h >= 6 ? "short" : "none");
const toneFor = (owned: number): TileTone => (owned === 0 ? "none" : owned === 1 ? "low" : owned <= 3 ? "mid" : "high");

/** Per-unit counts the tiles and the stats both need. */
function unitFacts(k: Knowledge) {
  const holdersOf = new Map<string, number>();
  for (const h of k.holders) holdersOf.set(h.roleId, (holdersOf.get(h.roleId) ?? 0) + 1);
  const unitOfRole = new Map(k.roles.map((r) => [r.id, r.orgUnitId]));
  const roles = new Map<string, number>();
  const vacant = new Map<string, number>();
  for (const r of k.roles) {
    if (!r.title) continue; // a stand-in for a name the org chart did not have
    roles.set(r.orgUnitId, (roles.get(r.orgUnitId) ?? 0) + 1);
    if (!holdersOf.has(r.id)) vacant.set(r.orgUnitId, (vacant.get(r.orgUnitId) ?? 0) + 1);
  }
  const owned = new Map<string, number>();
  for (const rule of k.rules) {
    const unit = unitOfRole.get(rule.ownerRoleId);
    if (unit) owned.set(unit, (owned.get(unit) ?? 0) + 1);
  }
  return { holdersOf, roles, vacant, owned };
}

/** Units grouped by parent. A unit whose parent is missing, itself, or in a loop is promoted to the top. */
function unitChildren(k: Knowledge): Map<string | null, UnitRow[]> {
  const ids = new Set(k.units.map((u) => u.id));
  const byParent = new Map<string | null, UnitRow[]>();
  for (const u of [...k.units].sort((a, b) => a.sort - b.sort)) {
    const p = u.parentId && ids.has(u.parentId) && u.parentId !== u.id ? u.parentId : null;
    byParent.set(p, [...(byParent.get(p) ?? []), u]);
  }
  // Anything not reachable from a root sits in a loop: promote it so it is drawn once.
  const reach = new Set<string>();
  const walk = (u: UnitRow) => { if (!reach.has(u.id)) { reach.add(u.id); (byParent.get(u.id) ?? []).forEach(walk); } };
  (byParent.get(null) ?? []).forEach(walk);
  for (const u of k.units) {
    if (reach.has(u.id)) continue;
    // Detach it from the parent it loops through, or it would be drawn there as well.
    if (u.parentId) byParent.set(u.parentId, (byParent.get(u.parentId) ?? []).filter((x) => x.id !== u.id));
    byParent.set(null, [...(byParent.get(null) ?? []), u]);
    walk(u);
  }
  return byParent;
}

/**
 * The units as a two-level treemap: top-level units sized by their people, units inside them laid
 * out within. A unit with no people recorded still gets a sliver, so nothing disappears. Units in
 * a parent loop (a bug in the data, not in this code) are drawn at the top level rather than lost.
 */
export function unitTiles(k: Knowledge): UnitTile[] {
  const byParent = unitChildren(k);

  const f = unitFacts(k);
  const weights = new Map<string, number>();
  const weight = (u: UnitRow, seen = new Set<string>()): number => {
    const known = weights.get(u.id);
    if (known !== undefined) return known;
    if (seen.has(u.id)) return Math.max(1, u.headcount);
    seen.add(u.id);
    const kids = (byParent.get(u.id) ?? []).reduce((n, c) => n + weight(c, seen), 0);
    const w = Math.max(1, u.headcount, kids);
    weights.set(u.id, w);
    return w;
  };

  const tiles: UnitTile[] = [];
  const lay = (units: readonly UnitRow[], rect: Rect, depth: number) => {
    const placed = squarify(units.map((u) => ({ id: u.id, weight: weight(u) })), rect);
    const byId = new Map(units.map((u) => [u.id, u]));
    for (const { id, rect: r } of placed) {
      const u = byId.get(id)!;
      const kids = byParent.get(u.id) ?? [];
      const inner = { x: r.x + PAD, y: r.y + HEAD, w: r.w - 2 * PAD, h: r.h - HEAD - PAD };
      const holds = depth < MAX_DEPTH && kids.length > 0 && inner.w >= 12 && inner.h >= 8;
      tiles.push({
        id: u.id, key: u.key, name: u.name, kind: u.kind, headcount: u.headcount,
        roles: f.roles.get(u.id) ?? 0, vacant: f.vacant.get(u.id) ?? 0, owned: f.owned.get(u.id) ?? 0,
        depth, rect: r, label: labelFor(r), tone: holds ? "group" : toneFor(f.owned.get(u.id) ?? 0),
      });
      if (holds) lay(kids, inner, depth + 1);
    }
  };
  lay(byParent.get(null) ?? [], { x: 0, y: 0, w: TREE_W, h: TREE_H }, 0);
  return tiles;
}

// ── Numbers above the picture ─────────────────────────────────────────────────────────────────

export type OrgStats = {
  units: number;
  people: number;
  roles: number;
  /** Titled roles nobody holds. */
  vacant: number;
  /** Roles that have at least one role reporting to them. */
  managers: number;
  /** Average number of roles directly under a manager role; 0 when there are none. */
  span: number;
  /** Levels from the top role to the deepest. */
  depth: number;
  /** Units that own no routing row and hold no other unit: nobody can send an idea there. */
  deadEnds: number;
};

export function orgStats(k: Knowledge): OrgStats {
  const titled = k.roles.filter((r) => r.title);
  const held = new Set(k.holders.map((h) => h.roleId));
  const boss = new Map<string, number>();
  for (const r of k.roles) if (r.reportsToId) boss.set(r.reportsToId, (boss.get(r.reportsToId) ?? 0) + 1);
  const reports = [...boss.values()].reduce((n, c) => n + c, 0);

  const byParent = unitChildren(k);
  // A unit's people: what it records, or what the units inside it add up to, whichever is more.
  const people = (u: UnitRow, seen = new Set<string>()): number => {
    if (seen.has(u.id)) return u.headcount;
    seen.add(u.id);
    return Math.max(u.headcount, (byParent.get(u.id) ?? []).reduce((n, c) => n + people(c, seen), 0));
  };
  const ownedBy = new Map(unitTiles(k).map((t) => [t.id, t.owned]));
  const parents = new Set(k.units.map((u) => u.parentId).filter((p): p is string => Boolean(p)));
  return {
    units: k.units.length,
    people: (byParent.get(null) ?? []).reduce((n, u) => n + people(u), 0),
    roles: titled.length,
    vacant: titled.filter((r) => !held.has(r.id)).length,
    managers: boss.size,
    span: boss.size ? Math.round((reports / boss.size) * 10) / 10 : 0,
    depth: roleTree(k).reduce((d, n) => Math.max(d, n.depth + 1), 0),
    deadEnds: k.units.filter((u) => !parents.has(u.id) && !ownedBy.get(u.id)).length,
  };
}

// ── Role tree ─────────────────────────────────────────────────────────────────────────────────

export type RoleBranch = {
  id: string;
  title: string;
  unit: string;
  unitKey: string;
  /** How many people hold it. Never who. */
  holders: number;
  /** Roles directly under this one, before any were cut. */
  reports: number;
  /** This role and everything beneath it. */
  total: number;
  decides: string[];
  spendLimitEur: number | null;
  children: RoleBranch[];
  /** Direct reports not drawn because of the width cap. */
  hidden: number;
};

export type RoleForest = { roots: RoleBranch[]; shown: number; total: number };

/** Most children drawn under one role, and most roles drawn on the whole page. */
export const MAX_CHILDREN = 24;
export const MAX_ROLES = 300;

/**
 * The role tree as nested branches, cut to fit: at most MAX_CHILDREN under a role (biggest
 * subtrees first, so what is dropped is the small end) and MAX_ROLES in all. With `unitKey`, only
 * roles of that unit; a role whose boss is in another unit becomes a top of its own.
 */
export function roleForest(k: Knowledge, unitKey?: string): RoleForest {
  const unitById = new Map(k.units.map((u) => [u.id, u]));
  const held = new Map<string, number>();
  for (const h of k.holders) held.set(h.roleId, (held.get(h.roleId) ?? 0) + 1);

  const roles = k.roles.filter((r) => r.title && (!unitKey || unitById.get(r.orgUnitId)?.key === unitKey));
  const ids = new Set(roles.map((r) => r.id));
  const under = new Map<string | null, RoleRow[]>();
  for (const r of [...roles].sort((a, b) => a.sort - b.sort)) {
    const boss = r.reportsToId && ids.has(r.reportsToId) && r.reportsToId !== r.id ? r.reportsToId : null;
    under.set(boss, [...(under.get(boss) ?? []), r]);
  }
  // Roles in a reporting loop are reachable from no top; make them tops so none is lost.
  const reach = new Set<string>();
  const mark = (r: RoleRow) => { if (!reach.has(r.id)) { reach.add(r.id); (under.get(r.id) ?? []).forEach(mark); } };
  (under.get(null) ?? []).forEach(mark);
  for (const r of roles) {
    if (reach.has(r.id)) continue;
    if (r.reportsToId) under.set(r.reportsToId, (under.get(r.reportsToId) ?? []).filter((x) => x.id !== r.id));
    under.set(null, [...(under.get(null) ?? []), r]);
    mark(r);
  }

  const sizes = new Map<string, number>();
  const size = (r: RoleRow, seen = new Set<string>()): number => {
    const known = sizes.get(r.id);
    if (known !== undefined) return known;
    if (seen.has(r.id)) return 1;
    seen.add(r.id);
    const n = 1 + (under.get(r.id) ?? []).reduce((a, c) => a + size(c, seen), 0);
    sizes.set(r.id, n);
    return n;
  };

  let shown = 0;
  const build = (r: RoleRow, depth: number): RoleBranch | null => {
    if (shown >= MAX_ROLES) return null;
    shown++;
    const kids = [...(under.get(r.id) ?? [])].sort((a, b) => size(b) - size(a));
    const children: RoleBranch[] = [];
    for (const c of kids.slice(0, MAX_CHILDREN)) {
      const b = depth < 12 ? build(c, depth + 1) : null;
      if (b) children.push(b);
    }
    const u = unitById.get(r.orgUnitId);
    return {
      id: r.id, title: r.title, unit: u?.name ?? "", unitKey: u?.key ?? "",
      holders: held.get(r.id) ?? 0, reports: kids.length, total: size(r),
      decides: r.decides, spendLimitEur: r.spendLimitEur,
      children, hidden: kids.length - children.length,
    };
  };

  const tops = [...(under.get(null) ?? [])].sort((a, b) => size(b) - size(a));
  const roots = tops.flatMap((r) => { const b = build(r, 0); return b ? [b] : []; });
  return { roots, shown, total: roles.length };
}

// ── Routing health ────────────────────────────────────────────────────────────────────────────

/** complete: owner, deputy and buddy all exist and are held. The rest say what is missing first. */
export type RuleStatus = "complete" | "no-owner" | "vacant-owner" | "no-deputy" | "no-buddy";

export type RuleCell = { key: string; type: string; status: RuleStatus; owner: string; unitKey: string };

export type RoutingHealth = {
  cells: RuleCell[];
  counts: Record<RuleStatus, number>;
  /** Up to `limit` rows with something missing, worst first. */
  gaps: RuleCell[];
};

const RANK: Record<RuleStatus, number> = { "no-owner": 0, "vacant-owner": 1, "no-deputy": 2, "no-buddy": 3, complete: 4 };

export const STATUS_LABEL: Record<RuleStatus, string> = {
  complete: "complete",
  "no-owner": "owner role missing",
  "vacant-owner": "nobody holds the owner role",
  "no-deputy": "no deputy",
  "no-buddy": "no buddy",
};

export function routingHealth(k: Knowledge, limit = 8): RoutingHealth {
  const roleById = new Map(k.roles.map((r) => [r.id, r]));
  const unitById = new Map(k.units.map((u) => [u.id, u]));
  const held = new Set(k.holders.map((h) => h.roleId));
  const real = (id: string | null) => (id && roleById.has(id) ? roleById.get(id)! : null);

  const cells: RuleCell[] = [...k.rules].sort((a, b) => a.sort - b.sort).map((rule) => {
    const owner = real(rule.ownerRoleId);
    const deputy = real(rule.deputyRoleId);
    const buddy = real(rule.buddyRoleId);
    const status: RuleStatus = !owner ? "no-owner"
      : !held.has(owner.id) ? "vacant-owner"
      : !deputy || !held.has(deputy.id) ? "no-deputy"
      : !buddy || !held.has(buddy.id) ? "no-buddy"
      : "complete";
    return { key: rule.key, type: rule.type, status, owner: owner?.title ?? "", unitKey: owner ? unitById.get(owner.orgUnitId)?.key ?? "" : "" };
  });

  const counts: Record<RuleStatus, number> = { complete: 0, "no-owner": 0, "vacant-owner": 0, "no-deputy": 0, "no-buddy": 0 };
  for (const c of cells) counts[c.status]++;
  const gaps = cells.filter((c) => c.status !== "complete").sort((a, b) => RANK[a.status] - RANK[b.status]).slice(0, limit);
  return { cells, counts, gaps };
}
