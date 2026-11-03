"use server";
// Settings -> Areas (FLR-A1). One action per change: companyAdminOf -> load the company's knowledge ->
// pure rule (checkArea) -> lib/db/floor.ts -> audit row -> revalidate. The company id is the guard's,
// never the form's; unit, role and area ids from the form are checked against that company.
import { revalidatePath } from "next/cache";
import { auditChanges } from "@/features/audit";
import { checkArea, type AreaFormInput } from "@/features/floor/areas";
import { companyPrefix } from "@/features/tenant/urls";
import type { MessageKey } from "@/i18n";
import { listAreas, removeArea, saveArea, type AreaRow } from "@/lib/db/floor";
import { loadKnowledge } from "@/lib/db/knowledge";
import { recordAudit, settingsActor } from "@/server/audit/record";
import { companyAdminOf } from "./guard";

export type AreaResult = { ok: true } | { ok: false; error: MessageKey };

const fieldsOf = (a: Pick<AreaRow, "key" | "name" | "unitId" | "roleId" | "anonymous" | "on">) => ({
  key: a.key, name: a.name, unitId: a.unitId, roleId: a.roleId, anonymous: a.anonymous, on: a.on,
});

async function audit(companyId: string, admin: { userId: string }, id: string, before: AreaRow | null, after: AreaRow | null): Promise<AreaResult> {
  try {
    await recordAudit(companyId, {
      actor: settingsActor(admin),
      action: "audit.settings.areas",
      target: { kind: "area", id },
      changes: auditChanges(before && fieldsOf(before), after && fieldsOf(after)),
      source: "settings",
    });
    return { ok: true };
  } catch {
    return { ok: false, error: "settingsAreas.errAudit" };
  }
}

const done = (slug: string): AreaResult => {
  revalidatePath(`${companyPrefix(slug)}/settings/areas`);
  return { ok: true };
};

export async function saveAreaAction(slug: string, input: AreaFormInput): Promise<AreaResult> {
  const admin = await companyAdminOf(slug);
  if (!admin) return { ok: false, error: "settingsAreas.errForbidden" };
  const [knowledge, areas] = await Promise.all([loadKnowledge(admin.companyId), listAreas(admin.companyId)]);
  const before = input.id ? (areas.find((a) => a.id === input.id) ?? null) : null;
  if (input.id && !before) return { ok: false, error: "settingsAreas.errNotFound" };
  const checked = checkArea(input, {
    units: knowledge.units,
    roles: knowledge.roles,
    keysInUse: areas.filter((a) => a.id !== input.id).map((a) => a.key),
  });
  if (!checked.ok) return checked;
  const saved = await saveArea(admin.companyId, checked.value, admin.userId);
  const logged = await audit(admin.companyId, admin, saved.id, before, saved);
  return logged.ok ? done(slug) : logged;
}

export async function setAreaOnAction(slug: string, id: string, on: boolean): Promise<AreaResult> {
  const admin = await companyAdminOf(slug);
  if (!admin) return { ok: false, error: "settingsAreas.errForbidden" };
  const before = (await listAreas(admin.companyId)).find((a) => a.id === id);
  if (!before) return { ok: false, error: "settingsAreas.errNotFound" };
  const saved = await saveArea(admin.companyId, { id, key: before.key, name: before.name, unitId: before.unitId, roleId: before.roleId, on }, admin.userId);
  const logged = await audit(admin.companyId, admin, id, before, saved);
  return logged.ok ? done(slug) : logged;
}

export async function removeAreaAction(slug: string, id: string): Promise<AreaResult> {
  const admin = await companyAdminOf(slug);
  if (!admin) return { ok: false, error: "settingsAreas.errForbidden" };
  const before = (await listAreas(admin.companyId)).find((a) => a.id === id);
  if (!before) return { ok: false, error: "settingsAreas.errNotFound" };
  await removeArea(admin.companyId, id);
  const logged = await audit(admin.companyId, admin, id, before, null);
  return logged.ok ? done(slug) : logged;
}
