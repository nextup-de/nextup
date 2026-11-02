// The rules of the org and routing editor (ADM D8). Pure: a change and the company's Knowledge in,
// null or the message key of the rule that refuses it out. lib/db/org-edit.ts writes what passes.
import type { Knowledge } from "@/features/knowledge";
import type { MessageKey } from "@/i18n";

export type OrgError = Extract<MessageKey, `settingsOrg.err${string}`>;

export type UnitInput = { key: string; name: string; kind: string; headcount: number; parentId: string | null };
export type UnitPatch = Omit<UnitInput, "key">;
export type RoleInput = { orgUnitId: string; title: string; reportsToId: string | null; decides: string[]; spendLimitEur: number | null };
export type SeatInput = { roleId: string; name: string; userId: string | null };
export type RouteInput = {
  key: string; type: string; keywords: string[]; ownerRoleId: string | null;
  deputyRoleId: string | null; buddyRoleId: string | null; wait: string;
};

export type OrgChange =
  | { kind: "addUnit"; unit: UnitInput }
  | { kind: "updateUnit"; id: string; unit: UnitPatch }
  | { kind: "removeUnit"; id: string }
  | { kind: "addRole"; role: RoleInput }
  | { kind: "updateRole"; id: string; role: RoleInput }
  | { kind: "removeRole"; id: string }
  | { kind: "addSeat"; seat: SeatInput }
  | { kind: "removeSeat"; id: string }
  | { kind: "linkSeat"; id: string }
  | { kind: "saveRoute"; route: RouteInput }
  | { kind: "removeRoute"; id: string };

export const UNIT_KEY = /^[A-Z0-9_]{1,32}$/;
export const ROUTE_KEY = /^[A-Za-z0-9_]{1,32}$/;
export const UNIT_KINDS = ["board", "dept", "team"] as const;

const titleOk = (s: string) => s.trim().length >= 1 && s.trim().length <= 120;
const countOk = (n: number | null) => n === null || (Number.isInteger(n) && n >= 0 && n <= 1_000_000_000);

/** Keywords 1-30 of 1-40 characters (trimmed). */
export function keywordsRule(keywords: readonly string[]): OrgError | null {
  const ks = keywords.map((k) => k.trim());
  return ks.length >= 1 && ks.length <= 30 && ks.every((k) => k.length >= 1 && k.length <= 40) ? null : "settingsOrg.errKeywords";
}

/** Key shape, then uniqueness among `existing` keys. */
export function keyRule(key: string, existing: readonly string[], shape: RegExp = UNIT_KEY): OrgError | null {
  if (!shape.test(key)) return "settingsOrg.errKeyFormat";
  return existing.includes(key) ? "settingsOrg.errKeyDuplicate" : null;
}

/** Would pointing `id` at `parentId` make `id` its own ancestor? `parentOf` gives one step up. */
function loops(id: string, parentId: string | null, parentOf: (x: string) => string | null): boolean {
  const seen = new Set<string>();
  for (let cur = parentId; cur !== null; cur = parentOf(cur)) {
    if (cur === id) return true;
    if (seen.has(cur)) return false; // an existing loop elsewhere is not this change's doing
    seen.add(cur);
  }
  return false;
}

/** A role may not report to itself, directly or through others. `roleId` null = a new role (cannot loop). */
export function reportsToRule(k: Knowledge, roleId: string | null, reportsToId: string | null): OrgError | null {
  if (reportsToId === null) return null;
  if (!k.roles.some((r) => r.id === reportsToId)) return "settingsOrg.errNotFound";
  if (roleId === null) return null;
  const boss = new Map(k.roles.map((r) => [r.id, r.reportsToId]));
  return loops(roleId, reportsToId, (x) => boss.get(x) ?? null) ? "settingsOrg.errReportsLoop" : null;
}

/** Does any route name the role as owner, deputy or buddy? */
const routeNames = (k: Knowledge, roleId: string) =>
  k.rules.some((r) => r.ownerRoleId === roleId || r.deputyRoleId === roleId || r.buddyRoleId === roleId);

export function removeRoleRule(k: Knowledge, roleId: string): OrgError | null {
  if (!k.roles.some((r) => r.id === roleId)) return "settingsOrg.errNotFound";
  return routeNames(k, roleId) ? "settingsOrg.errRoleOnRoute" : null;
}

export function removeUnitRule(k: Knowledge, unitId: string): OrgError | null {
  if (!k.units.some((u) => u.id === unitId)) return "settingsOrg.errNotFound";
  return k.roles.some((r) => r.orgUnitId === unitId && routeNames(k, r.id)) ? "settingsOrg.errUnitOnRoute" : null;
}

function unitFieldsRule(k: Knowledge, id: string | null, u: UnitPatch): OrgError | null {
  if (!titleOk(u.name)) return "settingsOrg.errTitle";
  if (!countOk(u.headcount)) return "settingsOrg.errNumber";
  if (!(UNIT_KINDS as readonly string[]).includes(u.kind)) return "settingsOrg.errNotFound";
  if (u.parentId !== null) {
    if (!k.units.some((x) => x.id === u.parentId)) return "settingsOrg.errNotFound";
    const parent = new Map(k.units.map((x) => [x.id, x.parentId]));
    if (id !== null && loops(id, u.parentId, (x) => parent.get(x) ?? null)) return "settingsOrg.errUnitLoop";
  }
  return null;
}

function roleFieldsRule(k: Knowledge, id: string | null, r: RoleInput): OrgError | null {
  if (!titleOk(r.title)) return "settingsOrg.errTitle";
  if (!k.units.some((u) => u.id === r.orgUnitId)) return "settingsOrg.errNotFound";
  if (!countOk(r.spendLimitEur)) return "settingsOrg.errNumber";
  return reportsToRule(k, id, r.reportsToId);
}

function routeRule(k: Knowledge, r: RouteInput): OrgError | null {
  if (!k.rules.some((x) => x.key === r.key)) {
    const e = keyRule(r.key, k.rules.map((x) => x.key), ROUTE_KEY);
    if (e) return e;
  }
  if (r.type.trim().length < 1 || r.type.trim().length > 120) return "settingsOrg.errRouteType";
  if (r.ownerRoleId === null || !k.roles.some((x) => x.id === r.ownerRoleId)) return "settingsOrg.errRouteNoOwner";
  for (const id of [r.deputyRoleId, r.buddyRoleId]) if (id !== null && !k.roles.some((x) => x.id === id)) return "settingsOrg.errNotFound";
  return keywordsRule(r.keywords);
}

/** The first rule a change breaks, or null when it is fine. */
export function checkChange(k: Knowledge, c: OrgChange): OrgError | null {
  switch (c.kind) {
    case "addUnit":
      return keyRule(c.unit.key, k.units.map((u) => u.key)) ?? unitFieldsRule(k, null, c.unit);
    case "updateUnit":
      return k.units.some((u) => u.id === c.id) ? unitFieldsRule(k, c.id, c.unit) : "settingsOrg.errNotFound";
    case "removeUnit":
      return removeUnitRule(k, c.id);
    case "addRole":
      return roleFieldsRule(k, null, c.role);
    case "updateRole":
      return k.roles.some((r) => r.id === c.id) ? roleFieldsRule(k, c.id, c.role) : "settingsOrg.errNotFound";
    case "removeRole":
      return removeRoleRule(k, c.id);
    case "addSeat": {
      if (!k.roles.some((r) => r.id === c.seat.roleId)) return "settingsOrg.errNotFound";
      if (!titleOk(c.seat.name)) return "settingsOrg.errSeatName";
      return k.holders.some((h) => h.roleId === c.seat.roleId && h.name === c.seat.name.trim()) ? "settingsOrg.errSeatDuplicate" : null;
    }
    case "removeSeat":
    case "linkSeat":
      return k.holders.some((h) => h.id === c.id) ? null : "settingsOrg.errNotFound";
    case "saveRoute":
      return routeRule(k, c.route);
    case "removeRoute":
      return k.rules.some((r) => r.id === c.id) ? null : "settingsOrg.errNotFound";
  }
}
