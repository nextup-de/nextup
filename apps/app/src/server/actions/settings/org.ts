"use server";
// Settings -> Org and Routing (ADM D8). One action per change: companyAdminOf -> load the
// company's knowledge -> pure rule -> write -> revalidate. The company id is the guard's, never the
// form's; every id from the form is checked against the loaded knowledge of that company.
import { revalidatePath } from "next/cache";
import { checkChange, type OrgChange, type OrgError, type RoleInput, type RouteInput, type UnitInput, type UnitPatch } from "@/features/org-edit";
import { companyPrefix } from "@/features/tenant/urls";
import { loadKnowledge } from "@/lib/db/knowledge";
import * as write from "@/lib/db/org-edit";
import { companyAdminOf } from "./guard";

export type OrgResult = { ok: true } | { ok: false; error: OrgError };

/** Guard, load, check; then `run` writes. */
async function apply(
  slug: string,
  change: OrgChange,
  run: (companyId: string, by: string) => Promise<OrgError | void>,
): Promise<OrgResult> {
  const admin = await companyAdminOf(slug);
  if (!admin) return { ok: false, error: "settingsOrg.errForbidden" };
  const refused = checkChange(await loadKnowledge(admin.companyId), change);
  if (refused) return { ok: false, error: refused };
  const late = await run(admin.companyId, admin.name);
  if (late) return { ok: false, error: late };
  for (const part of ["org", "routing"]) revalidatePath(`${companyPrefix(slug)}/settings/${part}`);
  return { ok: true };
}

export async function addUnitAction(slug: string, unit: UnitInput): Promise<OrgResult> {
  return apply(slug, { kind: "addUnit", unit }, async (c, by) => { await write.addUnit(c, by, unit); });
}
export async function updateUnitAction(slug: string, id: string, unit: UnitPatch): Promise<OrgResult> {
  return apply(slug, { kind: "updateUnit", id, unit }, (c, by) => write.updateUnit(c, by, id, unit));
}
export async function removeUnitAction(slug: string, id: string): Promise<OrgResult> {
  return apply(slug, { kind: "removeUnit", id }, (c) => write.removeUnit(c, id));
}

export async function addRoleAction(slug: string, role: RoleInput): Promise<OrgResult> {
  return apply(slug, { kind: "addRole", role }, async (c, by) => { await write.addRole(c, by, role); });
}
export async function updateRoleAction(slug: string, id: string, role: RoleInput): Promise<OrgResult> {
  return apply(slug, { kind: "updateRole", id, role }, (c, by) => write.updateRole(c, by, id, role));
}
export async function removeRoleAction(slug: string, id: string): Promise<OrgResult> {
  return apply(slug, { kind: "removeRole", id }, (c) => write.removeRole(c, id));
}

export async function addSeatAction(slug: string, roleId: string, name: string, userId: string | null): Promise<OrgResult> {
  return apply(slug, { kind: "addSeat", seat: { roleId, name, userId } }, async (c) => {
    const id = await write.addSeat(c, roleId, name, null);
    if (userId !== null && !(await write.linkSeat(c, id, userId))) {
      await write.removeSeat(c, id);
      return "settingsOrg.errMember";
    }
  });
}
export async function linkSeatAction(slug: string, seatId: string, userId: string | null): Promise<OrgResult> {
  return apply(slug, { kind: "linkSeat", id: seatId }, async (c) => ((await write.linkSeat(c, seatId, userId)) ? undefined : "settingsOrg.errMember"));
}
export async function removeSeatAction(slug: string, seatId: string): Promise<OrgResult> {
  return apply(slug, { kind: "removeSeat", id: seatId }, (c) => write.removeSeat(c, seatId));
}

export async function saveRouteAction(slug: string, route: RouteInput): Promise<OrgResult> {
  return apply(slug, { kind: "saveRoute", route }, async (c, by) => {
    if (route.ownerRoleId === null) return "settingsOrg.errRouteNoOwner";
    await write.saveRoute(c, by, { ...route, ownerRoleId: route.ownerRoleId });
  });
}
export async function removeRouteAction(slug: string, id: string): Promise<OrgResult> {
  return apply(slug, { kind: "removeRoute", id }, (c) => write.removeRoute(c, id));
}
export async function moveRouteAction(slug: string, id: string, dir: "up" | "down"): Promise<OrgResult> {
  return apply(slug, { kind: "removeRoute", id }, (c, by) => write.moveRoute(c, by, id, dir === "up" ? "up" : "down"));
}
