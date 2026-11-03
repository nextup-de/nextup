"use server";
// /<company>/settings/api-tokens (API-E1). Each action starts with companyAdminOf; the company id is the guard's,
// never the form's. The raw token is returned once, by createTokenAction, and stored nowhere.
import { revalidatePath } from "next/cache";
import { checkToken, expiryOf, isExpiryChoice } from "@/features/api/token-form";
import { companyPrefix } from "@/features/tenant/urls";
import type { MessageKey } from "@/i18n";
import { createToken, listTokens, revokeToken } from "@/lib/db/tokens";
import { settingsActor } from "@/server/audit/record";
import { companyAdminOf } from "./guard";

export type CreateTokenResult = { ok: true; token: string } | { ok: false; error: MessageKey };
export type RevokeTokenResult = { ok: true } | { ok: false; error: MessageKey };

export async function createTokenAction(
  slug: string,
  input: { name: string; scopes: string[]; expiry: string },
): Promise<CreateTokenResult> {
  const viewer = await companyAdminOf(slug);
  if (!viewer) return { ok: false, error: "settingsCompany.forbidden" };
  const expiry = String(input.expiry);
  if (!isExpiryChoice(expiry)) return { ok: false, error: "settingsApiTokens.errExpiry" };
  const live = (await listTokens(viewer.companyId)).filter((t) => !t.revokedAt).map((t) => t.name);
  const checked = checkToken(
    { name: String(input.name ?? ""), scopes: Array.isArray(input.scopes) ? input.scopes.map(String) : [] },
    live,
  );
  if (!checked.ok) return checked;
  try {
    const token = await createToken(viewer.companyId, checked.value.name, checked.value.scopes, {
      createdBy: viewer.userId,
      expiresAt: expiryOf(expiry, new Date()),
      actor: settingsActor(viewer),
    });
    revalidatePath(`${companyPrefix(slug)}/settings/api-tokens`);
    return { ok: true, token };
  } catch {
    return { ok: false, error: "settingsCompany.auditFailed" };
  }
}

export async function revokeTokenAction(slug: string, id: string): Promise<RevokeTokenResult> {
  const viewer = await companyAdminOf(slug);
  if (!viewer) return { ok: false, error: "settingsCompany.forbidden" };
  try {
    if (!(await revokeToken(viewer.companyId, String(id), settingsActor(viewer)))) return { ok: false, error: "settingsApiTokens.errGone" };
  } catch {
    return { ok: false, error: "settingsCompany.auditFailed" };
  }
  revalidatePath(`${companyPrefix(slug)}/settings/api-tokens`);
  return { ok: true };
}
