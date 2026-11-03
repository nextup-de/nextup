"use server";
// Settings -> Org and Routing (ADM D8). One action per change: companyAdminOf -> load the
// company's knowledge -> pure rule -> write + audit row in one transaction -> revalidate. The company
// id is the guard's, never the form's; every id from the form is checked against the loaded knowledge
// of that company.
import { revalidatePath } from "next/cache";
import { auditChanges } from "@/features/audit";
import type { Knowledge } from "@/features/knowledge";
import { checkChange, type OrgChange, type OrgError, type RoleInput, type RouteInput, type UnitInput, type UnitPatch } from "@/features/org-edit";
import { companyPrefix } from "@/features/tenant/urls";
import { loadKnowledge } from "@/lib/db/knowledge";
import * as write from "@/lib/db/org-edit";
import { settingsActor, type AuditEntry } from "@/server/audit/record";
import { audited, type Tx } from "./audited";
import { companyAdminOf } from "./guard";

export type OrgResult = { ok: true } | { ok: false; error: OrgError };

/** What a change records; the actor and the source are the same for all of them. */
type Described = Pick<AuditEntry, "action" | "target" | "changes">;
type Ran = { late?: OrgError; id?: string };

const clean = (xs: readonly string[]) => xs.map((x) => x.trim()).filter(Boolean);
const unitFields = (u: { key?: string; name: string; kind: string; headcount: number; parentId: string | null }) =>
  ({ ...(u.key === undefined ? {} : { key: u.key }), name: u.name.trim(), kind: u.kind, headcount: u.headcount, parentId: u.parentId });
const roleFields = (r: RoleInput | Knowledge["roles"][number]) =>
  ({ orgUnitId: r.orgUnitId, title: r.title.trim(), reportsToId: r.reportsToId, decides: clean(r.decides), spendLimitEur: r.spendLimitEur });
const routeFields = (r: { type: string; keywords: string[]; ownerRoleId: string | null; deputyRoleId: string | null; buddyRoleId: string | null; wait: string }) =>
  ({ type: r.type.trim(), keywords: clean(r.keywords), ownerRoleId: r.ownerRoleId, deputyRoleId: r.deputyRoleId, buddyRoleId: r.buddyRoleId, wait: r.wait.trim() });

/**
 * Guard, load, check; then `run` writes and `describe` says what to record, both in one transaction.
 * `describe` gets the knowledge as it was before and the id `run` made; null records nothing.
 */
async function apply(
  slug: string,
  change: OrgChange,
  run: (companyId: string, by: string, tx: Tx) => Promise<OrgError | Ran | void>,
  describe: (before: Knowledge, id: string | undefined) => Described | null,
): Promise<OrgResult> {
  const admin = await companyAdminOf(slug);
  if (!admin) return { ok: false, error: "settingsOrg.errForbidden" };
  const before = await loadKnowledge(admin.companyId);
  const refused = checkChange(before, change);
  if (refused) return { ok: false, error: refused };
  const saved = await audited<Ran>(
    admin.companyId,
    (r) => {
      if (r.late) return null;
      const d = describe(before, r.id);
      return d && { ...d, actor: settingsActor(admin), source: "settings" };
    },
    async (tx) => {
      const out = await run(admin.companyId, admin.name, tx);
      return typeof out === "string" ? { late: out } : (out ?? {});
    },
  );
  if (!saved.ok) return { ok: false, error: "settingsOrg.errAudit" };
  if (saved.value.late) return { ok: false, error: saved.value.late };
  for (const part of ["org", "routing"]) revalidatePath(`${companyPrefix(slug)}/settings/${part}`);
  return { ok: true };
}

export async function addUnitAction(slug: string, unit: UnitInput): Promise<OrgResult> {
  return apply(
    slug, { kind: "addUnit", unit },
    async (c, by, tx) => ({ id: await write.addUnit(c, by, unit, tx) }),
    (_k, id) => ({ action: "audit.settings.org", target: { kind: "unit", id: id ?? "" }, changes: auditChanges(null, unitFields(unit)) }),
  );
}
export async function updateUnitAction(slug: string, id: string, unit: UnitPatch): Promise<OrgResult> {
  return apply(
    slug, { kind: "updateUnit", id, unit },
    (c, by, tx) => write.updateUnit(c, by, id, unit, tx),
    (k) => {
      const old = k.units.find((u) => u.id === id);
      return { action: "audit.settings.org", target: { kind: "unit", id }, changes: auditChanges(old && unitFields(old), unitFields(unit)) };
    },
  );
}
export async function removeUnitAction(slug: string, id: string): Promise<OrgResult> {
  return apply(
    slug, { kind: "removeUnit", id },
    (c, _by, tx) => write.removeUnit(c, id, tx),
    (k) => {
      const old = k.units.find((u) => u.id === id);
      return { action: "audit.settings.org", target: { kind: "unit", id }, changes: auditChanges(old && unitFields(old), null) };
    },
  );
}

export async function addRoleAction(slug: string, role: RoleInput): Promise<OrgResult> {
  return apply(
    slug, { kind: "addRole", role },
    async (c, by, tx) => ({ id: await write.addRole(c, by, role, tx) }),
    (_k, id) => ({ action: "audit.settings.org", target: { kind: "role", id: id ?? "" }, changes: auditChanges(null, roleFields(role)) }),
  );
}
export async function updateRoleAction(slug: string, id: string, role: RoleInput): Promise<OrgResult> {
  return apply(
    slug, { kind: "updateRole", id, role },
    (c, by, tx) => write.updateRole(c, by, id, role, tx),
    (k) => {
      const old = k.roles.find((r) => r.id === id);
      return { action: "audit.settings.org", target: { kind: "role", id }, changes: auditChanges(old && roleFields(old), roleFields(role)) };
    },
  );
}
export async function removeRoleAction(slug: string, id: string): Promise<OrgResult> {
  return apply(
    slug, { kind: "removeRole", id },
    (c, _by, tx) => write.removeRole(c, id, tx),
    (k) => {
      const old = k.roles.find((r) => r.id === id);
      return { action: "audit.settings.org", target: { kind: "role", id }, changes: auditChanges(old && roleFields(old), null) };
    },
  );
}

// A seat name can be a person's name, so a seat is recorded by ids only (D9).
export async function addSeatAction(slug: string, roleId: string, name: string, userId: string | null): Promise<OrgResult> {
  return apply(
    slug, { kind: "addSeat", seat: { roleId, name, userId } },
    async (c, _by, tx) => {
      const id = await write.addSeat(c, roleId, name, null, tx);
      if (userId !== null && !(await write.linkSeat(c, id, userId, tx))) {
        await write.removeSeat(c, id, tx);
        return { late: "settingsOrg.errMember" as const };
      }
      return { id };
    },
    (_k, id) => ({ action: "audit.settings.org", target: { kind: "seat", id: id ?? "" }, changes: auditChanges(null, { roleId, userId }) }),
  );
}
export async function linkSeatAction(slug: string, seatId: string, userId: string | null): Promise<OrgResult> {
  return apply(
    slug, { kind: "linkSeat", id: seatId },
    async (c, _by, tx) => ((await write.linkSeat(c, seatId, userId, tx)) ? undefined : "settingsOrg.errMember"),
    (k) => ({
      action: "audit.member.seat", target: { kind: "seat", id: seatId },
      changes: { userId: { before: k.holders.find((h) => h.id === seatId)?.userId ?? null, after: userId } },
    }),
  );
}
export async function removeSeatAction(slug: string, seatId: string): Promise<OrgResult> {
  return apply(
    slug, { kind: "removeSeat", id: seatId },
    (c, _by, tx) => write.removeSeat(c, seatId, tx),
    (k) => {
      const old = k.holders.find((h) => h.id === seatId);
      return { action: "audit.settings.org", target: { kind: "seat", id: seatId }, changes: auditChanges(old && { roleId: old.roleId, userId: old.userId }, null) };
    },
  );
}

export async function saveRouteAction(slug: string, route: RouteInput): Promise<OrgResult> {
  return apply(
    slug, { kind: "saveRoute", route },
    async (c, by, tx) => {
      if (route.ownerRoleId === null) return { late: "settingsOrg.errRouteNoOwner" as const };
      await write.saveRoute(c, by, { ...route, ownerRoleId: route.ownerRoleId }, tx);
      const row = await tx.routingRule.findFirst({ where: { companyId: c, key: route.key }, select: { id: true } });
      return { id: row?.id };
    },
    (k, id) => {
      const old = k.rules.find((r) => r.key === route.key);
      return {
        action: "audit.settings.routing", target: { kind: "route", id: id ?? "" },
        changes: auditChanges(old && { key: old.key, ...routeFields(old) }, { key: route.key, ...routeFields(route) }),
      };
    },
  );
}
export async function removeRouteAction(slug: string, id: string): Promise<OrgResult> {
  return apply(
    slug, { kind: "removeRoute", id },
    (c, _by, tx) => write.removeRoute(c, id, tx),
    (k) => {
      const old = k.rules.find((r) => r.id === id);
      return { action: "audit.settings.routing", target: { kind: "route", id }, changes: auditChanges(old && { key: old.key, ...routeFields(old) }, null) };
    },
  );
}
export async function moveRouteAction(slug: string, id: string, dir: "up" | "down"): Promise<OrgResult> {
  const way = dir === "up" ? "up" : "down";
  return apply(
    slug, { kind: "removeRoute", id },
    (c, by, tx) => write.moveRoute(c, by, id, way, tx),
    () => ({ action: "audit.settings.routing", target: { kind: "route", id }, changes: { moved: { before: null, after: way } } }),
  );
}
