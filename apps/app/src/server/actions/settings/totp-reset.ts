"use server";
// Reset a lost second factor (ADM D19). A manager of the company resets another manager; a stack
// admin resets anyone of the company in /admin People. Both clear the sealed secret and the
// enrolment time, so the person enrols again at their next code login. Nothing else changes.
import { revalidatePath } from "next/cache";
import { companyPrefix, singleCompany } from "@/features/tenant/urls";
import { getDb } from "@/lib/db/client";
import { isAdmin } from "@/server/actions/admin";
import { settingsActor } from "@/server/audit/record";
import { audited, type Tx } from "./audited";
import { companyAdminOf } from "./guard";

export type TotpResetResult =
  | { ok: true }
  | { ok: false; error: "settings.totpResetForbidden" | "settings.totpResetSelf" | "settings.totpResetNone" | "settings.totpResetAudit" };

export type AdminTotpResetState = { saved?: boolean; error?: string };

/** The one log line: no name, id, email or company. */
const logReset = () => console.info(`[auth] totp reset ${new Date().toISOString()}`);

/** Clears the second factor of `userId` inside `companyId`; false when no such enrolled person. */
async function clear(companyId: string, userId: string, onlyManagers: boolean, client: Pick<Tx, "user"> = getDb()): Promise<boolean> {
  const { count } = await client.user.updateMany({
    where: { id: userId, companyId, totpEnabledAt: { not: null }, ...(onlyManagers ? { role: "manager" } : {}) },
    data: { totpSecretSealed: null, totpEnabledAt: null },
  });
  if (count === 0) return false;
  logReset();
  return true;
}

/** Ids of the managers of this company who have enrolled; empty unless the viewer is a company admin. */
export async function enrolledManagersAction(slug: string): Promise<string[]> {
  const admin = await companyAdminOf(slug);
  if (!admin) return [];
  const rows = await getDb().user.findMany({
    where: { companyId: admin.companyId, role: "manager", totpEnabledAt: { not: null } },
    select: { id: true },
  });
  return rows.map((r) => r.id);
}

/** A company admin resets another manager's second factor. Never their own, never another company's. */
export async function resetTotpAction(slug: string, userId: string): Promise<TotpResetResult> {
  const admin = await companyAdminOf(slug);
  if (!admin) return { ok: false, error: "settings.totpResetForbidden" };
  if (userId === admin.userId) return { ok: false, error: "settings.totpResetSelf" };
  const reset = await audited(
    admin.companyId,
    (cleared: boolean) =>
      cleared ? { actor: settingsActor(admin), action: "audit.member.totp_reset", target: { kind: "user", id: userId }, changes: {}, source: "settings" } : null,
    (tx) => clear(admin.companyId, userId, true, tx),
  );
  if (!reset.ok) return { ok: false, error: "settings.totpResetAudit" };
  if (!reset.value) return { ok: false, error: "settings.totpResetNone" };
  revalidatePath(`${companyPrefix(slug)}/settings/members`);
  return { ok: true };
}

/** A stack admin resets the second factor of a person of the company, in /admin People. */
export async function adminResetTotpAction(_prev: AdminTotpResetState, form: FormData): Promise<AdminTotpResetState> {
  if (!(await isAdmin())) return { error: "Not signed in to the admin area." };
  const slug = String(form.get("slug") ?? "");
  if (slug !== singleCompany()) return { error: "No such company." };
  const company = await getDb().company.findUnique({ where: { slug }, select: { id: true } });
  if (!company || !(await clear(company.id, String(form.get("userId") ?? ""), false))) {
    return { error: "No such enrolled person in this company." };
  }
  revalidatePath("/admin", "layout");
  return { saved: true };
}
