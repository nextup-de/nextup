"use server";
// /<company>/settings/support-access (SEC-S1, D7). Each action starts with companyAdminOf; the company id is the
// guard's, never the form's. The support code is returned once by grantSupportAction and stored nowhere.
import { revalidatePath } from "next/cache";
import { checkReason, isGrantChoice } from "@/features/admin/support-code";
import { companyPrefix } from "@/features/tenant/urls";
import type { MessageKey } from "@/i18n";
import { getDb } from "@/lib/db/client";
import { endGrant, extendGrant, openGrant } from "@/lib/db/support-grants";
import { companyAdminOf } from "./guard";

export type GrantSupportResult = { ok: true; code: string; until: string } | { ok: false; error: MessageKey };
export type ExtendSupportResult = { ok: true; until: string } | { ok: false; error: MessageKey };
export type EndSupportResult = { ok: true } | { ok: false; error: MessageKey };

const refresh = (slug: string) => revalidatePath(`${companyPrefix(slug)}/settings/support-access`);

/** A demo company is NextUp's own to work in: nothing to grant. */
async function isDemo(companyId: string): Promise<boolean> {
  const c = await getDb().company.findUnique({ where: { id: companyId }, select: { stage: true } });
  return !c || c.stage === "demo";
}

export async function grantSupportAction(slug: string, input: { hours: number; reason: string }): Promise<GrantSupportResult> {
  const viewer = await companyAdminOf(slug);
  if (!viewer) return { ok: false, error: "settingsCompany.forbidden" };
  if (await isDemo(viewer.companyId)) return { ok: false, error: "settingsSupport.errDemo" };
  const hours = Number(input?.hours);
  if (!isGrantChoice(hours)) return { ok: false, error: "settingsSupport.errHours" };
  const reason = checkReason(input?.reason);
  if (!reason.ok) return { ok: false, error: "settingsSupport.errReason" };
  try {
    const { grant, code } = await openGrant(viewer.companyId, { hours, reason: reason.value, grantedById: viewer.userId });
    refresh(slug);
    return { ok: true, code, until: grant.expiresAt.toISOString() };
  } catch {
    return { ok: false, error: "settingsCompany.auditFailed" };
  }
}

export async function extendSupportAction(slug: string, input: { hours: number }): Promise<ExtendSupportResult> {
  const viewer = await companyAdminOf(slug);
  if (!viewer) return { ok: false, error: "settingsCompany.forbidden" };
  if (await isDemo(viewer.companyId)) return { ok: false, error: "settingsSupport.errDemo" };
  const hours = Number(input?.hours);
  if (!isGrantChoice(hours)) return { ok: false, error: "settingsSupport.errHours" };
  try {
    const grant = await extendGrant(viewer.companyId, hours, new Date(), viewer.userId);
    if (!grant) return { ok: false, error: "settingsSupport.errNone" };
    refresh(slug);
    return { ok: true, until: grant.expiresAt.toISOString() };
  } catch {
    return { ok: false, error: "settingsCompany.auditFailed" };
  }
}

export async function endSupportAction(slug: string): Promise<EndSupportResult> {
  const viewer = await companyAdminOf(slug);
  if (!viewer) return { ok: false, error: "settingsCompany.forbidden" };
  try {
    if (!(await endGrant(viewer.companyId, viewer.userId))) return { ok: false, error: "settingsSupport.errNone" };
  } catch {
    return { ok: false, error: "settingsCompany.auditFailed" };
  }
  refresh(slug);
  return { ok: true };
}
