"use server";
// NextUp support access (ITC-F1, D8). A console admin opens a code; NextUp support signs in with it
// into a read-only session (every console write answers "support-read-only"). The company always
// comes from consoleCompany() or COMPANY_SLUG, never from a form.
import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { adminBase } from "@/features/admin/nav";
import {
  appendSignin,
  grantActive,
  hashSupportCode,
  newSupportCode,
  normalizeSupportCode,
  SUPPORT_GRANT_HOURS,
  verifySupportCode,
} from "@/features/admin/support-code";
import { getT } from "@/i18n/server";
import { getDb, hasDatabase } from "@/lib/db/client";
import { adminActor, issueAdminSession, supportBy } from "@/server/admin-session";
import { consoleCompany } from "@/server/console-guard";
import { clientKey, forgive, throttle } from "@/server/throttle";

export type SupportOpenState =
  | { ok: true; supportCode: string; validUntil: string }
  | { ok: false; code: "not-allowed" };
export type SupportRevokeState = { ok: true } | { ok: false; code: "not-allowed" };
export type SupportSignInState = { error?: string };

/** Only a console admin who came in with Microsoft or a personal code may open or revoke. */
async function opener() {
  const c = await consoleCompany();
  return c && (c.via === "entra" || c.via === "stack-admin") ? c : null;
}

const refresh = () => revalidatePath(adminBase() + "/support");

export async function openSupportAccess(): Promise<SupportOpenState> {
  const c = await opener();
  if (!c) return { ok: false, code: "not-allowed" };
  const db = getDb();
  const now = new Date();
  const code = newSupportCode();
  const expiresAt = new Date(now.getTime() + SUPPORT_GRANT_HOURS * 3_600_000);
  const openedBy = (await adminActor()) ?? c.via;
  await db.$transaction([
    // At most one active grant per company: the older one ends now.
    db.supportGrant.updateMany({ where: { companyId: c.companyId, revokedAt: null, expiresAt: { gt: now } }, data: { revokedAt: now } }),
    db.supportGrant.create({ data: { companyId: c.companyId, codeHash: hashSupportCode(code), expiresAt, openedBy } }),
  ]);
  refresh();
  return { ok: true, supportCode: code, validUntil: expiresAt.toISOString() };
}

export async function revokeSupportAccess(): Promise<SupportRevokeState> {
  const c = await opener();
  if (!c) return { ok: false, code: "not-allowed" };
  const now = new Date();
  await getDb().supportGrant.updateMany({ where: { companyId: c.companyId, revokedAt: null, expiresAt: { gt: now } }, data: { revokedAt: now } });
  refresh();
  return { ok: true };
}

/** NextUp support signs in with the code the customer opened. Same throttle as the admin code. */
export async function supportSignIn(code: string): Promise<SupportSignInState> {
  const slug = process.env.COMPANY_SLUG?.trim();
  const t = await getT();
  const wrong = { error: t("adminSupport.signInWrong") };
  if (!slug || !hasDatabase()) return wrong;

  const who = await clientKey();
  const blocked = throttle("adminLogin", who);
  if (blocked) return { error: blocked };

  const given = normalizeSupportCode(String(code ?? ""));
  const db = getDb();
  const company = given ? await db.company.findUnique({ where: { slug }, select: { id: true } }) : null;
  const now = new Date();
  const grants = company ? await db.supportGrant.findMany({ where: { companyId: company.id, revokedAt: null, expiresAt: { gt: now } } }) : [];
  const grant = grants.find((g) => grantActive(g, now) && verifySupportCode(given, g.codeHash));
  if (!grant) {
    console.warn(`[admin] wrong support code from ${who}`);
    return wrong;
  }

  forgive("adminLogin", who);
  console.info(`[admin] support ${now.toISOString()}`);
  await db.supportGrant.update({ where: { id: grant.id }, data: { signins: appendSignin(grant.signins, now) } });
  await issueAdminSession(supportBy(grant.id), false, "support", grant.expiresAt);
  redirect(adminBase() || "/");
}
