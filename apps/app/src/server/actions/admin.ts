"use server";
// The admin surface: create a company, hand out its people's login codes, delete it.
//
// Deliberately OUTSIDE the [company] segment and outside the role system. src/config/roles.ts has
// three roles and they are all per-company; a fourth "superadmin" role would change the meaning of
// every ROLE_ACCESS row. Instead /admin sits behind its own cookie, unlocked by ADMIN_ACCESS_CODE.
import { revalidatePath } from "next/cache";
import { cookies } from "next/headers";
import { redirect } from "next/navigation";
import { createHash, timingSafeEqual } from "node:crypto";
import { isTenantId } from "@/features/auth/entra";
import { generateLoginCode, hashLoginCode, normalizeLoginCode } from "@/features/auth/login-code";
import { totpContext, verifyTotp } from "@/features/auth/totp";
import { open, vaultKey } from "@/features/connectors/vault";
import { getT } from "@/i18n/server";
import { ADMIN_COOKIE, ADMIN_TTL_SECONDS, verifyAdmin } from "@/features/auth/cookie";
import { adminSessionOpen, issueAdminSession } from "@/server/admin-session";
import { consoleWriteRefusal } from "@/server/console-write";
import type { CompanyRow } from "@/features/admin/rows";
import { getDb, hasDatabase } from "@/lib/db/client";
import { companyUrl, dashboardUrl, landingUrl, singleCompany } from "@/features/tenant/urls";
import { DEMO_COMPANIES } from "@/features/tenant/demo-companies";
import { clientKey, forgive, throttle } from "@/server/throttle";
import { usableSecret } from "@/features/admin/environment";
import { consoleActor, recordAudit } from "@/server/audit/record";
import { breakGlassBy, codeMatches as windowCodeMatches, windowOpen } from "@/features/admin/break-glass";
import { readBreakGlassWindow } from "@/server/break-glass-window";

// The row shapes live in features/admin/rows.ts, next to the demo rows that mirror them.
export type { CompanyRow };

/** True when the console is asked to touch any company but this stack's own. */
function foreignCompany(slug: string): boolean {
  return slug !== singleCompany();
}

/** Compared as digests, so neither the code's content nor its length leaks through timing. */
function codeMatches(given: string, expected: string): boolean {
  const digest = (v: string) => createHash("sha256").update(v.normalize("NFKC")).digest();
  return timingSafeEqual(digest(given), digest(expected));
}

// The admin cookie is stateless (signed, 8 h), so deleting it only logs out THIS browser. Logging
// out also moves this watermark: every admin cookie issued before it stops working here, in this
// process - a copied cookie included. In memory on purpose (one box, one process); a restart
// clears it, which the 8 h expiry still bounds.
const adminRevocation = globalThis as unknown as { __nextupAdminRevokedAt?: number };

/** When the cookie was issued, read back from its (already verified) expiry. */
function issuedAt(raw: string): number | null {
  try {
    const payload = JSON.parse(Buffer.from(raw.slice(0, raw.indexOf(".")), "base64url").toString("utf8"));
    return typeof payload.exp === "number" ? payload.exp - ADMIN_TTL_SECONDS : null;
  } catch {
    return null;
  }
}

export async function isAdmin(): Promise<boolean> {
  // Not the placeholder on a public box: anyone could sign an admin cookie with it.
  const secret = usableSecret(process.env.AUTH_SECRET);
  if (!secret) return false;
  const raw = (await cookies()).get(ADMIN_COOKIE)?.value;
  if (!raw || !verifyAdmin(raw, secret)) return false;
  const revokedAt = adminRevocation.__nextupAdminRevokedAt;
  const iat = issuedAt(raw);
  if (revokedAt !== undefined && (iat === null || iat < revokedAt)) return false;
  return adminSessionOpen();
}

export type AdminLoginState = { error?: string };

export async function adminSignIn(_prev: AdminLoginState, form: FormData): Promise<AdminLoginState> {
  const expected = usableSecret(process.env.ADMIN_ACCESS_CODE);
  const secret = usableSecret(process.env.AUTH_SECRET);
  if (!secret) {
    return { error: "ADMIN_ACCESS_CODE and AUTH_SECRET must be set on the server, and not to the .env.example placeholder." };
  }

  // The code opens everything, so this is the tightest door: 5 tries per address per 15 min.
  const who = await clientKey();
  const blocked = await throttle("adminLogin", who);
  if (blocked) return { error: blocked };

  const given = String(form.get("code") ?? "");
  const t = await getT();

  // The stack's own company. Its stage decides which break-glass code works (SEC/D6): on demo the
  // shared ADMIN_ACCESS_CODE, on any other stage only the customer's open window. A stack company
  // that cannot be read counts as not demo - fail closed.
  const own = singleCompany();
  const home = own && hasDatabase() ? await getDb().company.findUnique({ where: { slug: own }, select: { id: true, stage: true } }) : null;
  const demo = own === null || home?.stage === "demo";

  if (demo) {
    if (!expected) {
      return { error: "ADMIN_ACCESS_CODE and AUTH_SECRET must be set on the server, and not to the .env.example placeholder." };
    }
    // (a) The shared code: break-glass. No person behind it, so the log line names nobody.
    if (given && codeMatches(given, expected)) {
      await forgive("adminLogin", who);
      console.info(`[admin] break-glass ${new Date().toISOString()}`);
      // A row for the stack's own company; the code itself is never written. A failed write stops the sign-in.
      if (home) await recordAudit(home.id, { actor: { kind: "break-glass", userId: null }, action: "audit.access.break_glass", changes: {}, source: "console" });
      await issueAdminSession(undefined, true, "break-glass");
      // In subdomain mode the admin surface is the host root, so adminHome() is "" - and redirect("")
      // is a TypeError: Invalid URL, not a redirect to the root.
      redirect(adminHome() || "/");
    }
  } else {
    // (a') The customer's window: a code from stack/break-glass.sh, valid until it closes.
    const window = await readBreakGlassWindow();
    if (given && windowOpen(window, new Date()) && windowCodeMatches(given, window)) {
      await forgive("adminLogin", who);
      console.info(`[admin] break-glass window ${new Date().toISOString()} until ${window.until.toISOString()}`);
      if (home) {
        await recordAudit(home.id, { actor: { kind: "break-glass", userId: null }, action: "audit.access.break_glass", changes: { until: window.until.toISOString() }, source: "console" });
      }
      await issueAdminSession(breakGlassBy(window.openedAt), true, "break-glass", window.until);
      redirect(adminHome() || "/");
    }
  }

  // (b) A stack admin's personal code plus the authenticator code.
  const code = normalizeLoginCode(given);
  const user =
    code && hasDatabase()
      ? await getDb().user.findUnique({
          where: { loginCodeHash: hashLoginCode(code) },
          include: { company: { select: { slug: true } } },
        })
      : null;
  const ownCompany = user?.company.slug === singleCompany();
  if (!user || !user.active || !user.isStackAdmin || !ownCompany) {
    console.warn(`[admin] wrong admin code from ${who}`);
    return { error: t("adminAccess.adminWrong") };
  }
  const key = vaultKey();
  if (!key) return { error: t("adminAccess.vaultMissing") };
  if (!user.totpEnabledAt || !user.totpSecretSealed) return { error: t("adminAccess.adminNotEnrolled") };
  const totp = String(form.get("totp") ?? "");
  if (!totp.trim()) return { error: t("adminAccess.totpRequired") };
  const plain = open(user.totpSecretSealed, key, totpContext(user.companyId, user.id));
  if (!plain || !verifyTotp(plain, totp, Date.now())) return { error: t("adminAccess.totpWrong") };

  forgive("adminLogin", who);
  await issueAdminSession(user.name, false, "stack-admin");
  redirect(adminHome() || "/");
}

/**
 * Logs out this browser, and every other admin cookie issued up to now (see adminRevocation).
 * Leaving the admin area through the header's "Landing page" / "Dashboard" also logs out: `to`
 * names where to go next. A fixed key, never a URL, so this cannot become an open redirect.
 *
 * Only a signed-in admin moves the watermark. A server action can be called by anyone who has its
 * id, and an anonymous caller moving it would log every admin out - again, every second.
 */
export async function adminSignOut(form?: FormData) {
  if (await isAdmin()) adminRevocation.__nextupAdminRevokedAt = Math.floor(Date.now() / 1000);
  (await cookies()).delete(ADMIN_COOKIE);
  const to = form?.get("to");
  if (to === "landing") redirect(landingUrl());
  if (to === "dashboard") redirect(dashboardUrl(DEMO_COMPANIES[0].slug));
  redirect(adminHome() + "/login");
}

/** This stack's own company, for the console (D4/D5): never a list, never another company. */
export async function ownCompanyRow(): Promise<CompanyRow | null> {
  const slug = singleCompany();
  if (!slug || !(await isAdmin()) || !hasDatabase()) return null;
  const r = await getDb().company.findUnique({
    where: { slug },
    select: {
      id: true, slug: true, name: true, stage: true, createdAt: true, entraTenantId: true,
      users: {
        orderBy: { name: "asc" },
        select: { id: true, name: true, email: true, role: true, loginCodeAt: true, entraOid: true },
      },
      _count: { select: { users: true, events: true } },
    },
  });
  if (!r) return null;
  return {
    id: r.id,
    slug: r.slug,
    name: r.name,
    stage: r.stage,
    people: r._count.users,
    events: r._count.events,
    url: companyUrl(r.slug),
    createdAt: r.createdAt.toISOString(),
    entraTenantId: r.entraTenantId,
    // Same as microsoftCallbackUrl() builds from the request, spelled from the public address.
    microsoftCallback: `${companyUrl(r.slug)}/login/microsoft/callback`,
    persons: r.users.map((u) => ({
      id: u.id,
      name: u.name,
      email: u.email,
      role: u.role,
      codeIssuedAt: u.loginCodeAt?.toISOString() ?? null,
      microsoft: Boolean(u.entraOid),
    })),
  };
}

export type LoginCodeState = { slug?: string; name?: string; code?: string; error?: string };

/**
 * A new personal login code for one person. The previous one stops working at once - this is
 * also how a lost or leaked code is revoked. Shown once; only its hash is stored.
 */
export async function issueLoginCodeAction(_prev: LoginCodeState, form: FormData): Promise<LoginCodeState> {
  if (!(await isAdmin())) return { error: "Not signed in to the admin area." };
  if (!hasDatabase()) return { error: "No database is configured." };
  const refused = await consoleWriteRefusal();
  if (refused) return { error: refused };

  const slug = String(form.get("slug") ?? "");
  if (foreignCompany(slug)) return { error: "No such company." };
  const userId = String(form.get("userId") ?? "");
  const company = await getDb().company.findUnique({ where: { slug }, select: { id: true } });
  const user = company
    ? await getDb().user.findFirst({ where: { id: userId, companyId: company.id }, select: { id: true, name: true } })
    : null;
  if (!company || !user) return { error: "No such person in this company." };

  const code = generateLoginCode(slug);
  const actor = await consoleActor();
  await getDb().$transaction(async (tx) => {
    await tx.user.update({
      where: { id: user.id, companyId: company.id },
      data: { loginCodeHash: hashLoginCode(code), loginCodeAt: new Date() },
    });
    await recordAudit(company.id, { actor, action: "audit.member.code", target: { kind: "user", id: user.id }, changes: {}, source: "console" }, tx);
  });
  revalidatePath("/admin", "layout");
  return { slug, name: user.name, code };
}

export type StackAdminState = { saved?: boolean; error?: string };

/**
 * Lets one person open /admin with their own code and authenticator (or takes it away). Only an
 * admin sets it, never the person; the shared code is not enough to hand it out on the platform
 * stack's behalf of another company (foreignCompany).
 */
export async function setStackAdminAction(_prev: StackAdminState, form: FormData): Promise<StackAdminState> {
  if (!(await isAdmin())) return { error: "Not signed in to the admin area." };
  if (!hasDatabase()) return { error: "No database is configured." };
  const refused = await consoleWriteRefusal();
  if (refused) return { error: refused };

  const slug = String(form.get("slug") ?? "");
  if (foreignCompany(slug)) return { error: "No such company." };
  const userId = String(form.get("userId") ?? "");
  const on = form.get("stackAdmin") === "on";
  const company = await getDb().company.findUnique({ where: { slug }, select: { id: true } });
  if (!company) return { error: "No such person in this company." };
  const person = await getDb().user.findFirst({ where: { id: userId, companyId: company.id }, select: { id: true, isStackAdmin: true } });
  if (!person) return { error: "No such person in this company." };
  const actor = await consoleActor();
  await getDb().$transaction(async (tx) => {
    await tx.user.updateMany({ where: { id: person.id, companyId: company.id }, data: { isStackAdmin: on } });
    await recordAudit(company.id, { actor, action: "audit.access.stack_admin", target: { kind: "user", id: person.id }, changes: { isStackAdmin: { before: person.isStackAdmin, after: on } }, source: "console" }, tx);
  });
  revalidatePath("/admin", "layout");
  return { saved: true };
}

export type TenantState = { slug?: string; saved?: boolean; error?: string };

/** Turns "Continue with Microsoft" on for a company (its Entra tenant ID), or off (empty). */
export async function setEntraTenantAction(_prev: TenantState, form: FormData): Promise<TenantState> {
  if (!(await isAdmin())) return { error: "Not signed in to the admin area." };
  if (!hasDatabase()) return { error: "No database is configured." };
  const refused = await consoleWriteRefusal();
  if (refused) return { error: refused };

  const slug = String(form.get("slug") ?? "");
  if (foreignCompany(slug)) return { error: "No such company." };
  const raw = String(form.get("tenantId") ?? "").trim().toLowerCase();
  if (raw && !isTenantId(raw)) {
    return { slug, error: "That isn't an Entra tenant ID. It looks like 72f988bf-86f1-41af-91ab-2d7cd011db47 (Entra admin center → Overview)." };
  }
  const company = await getDb().company.findUnique({ where: { slug }, select: { id: true, entraTenantId: true } });
  if (!company) return { slug, error: "No such company." };
  const actor = await consoleActor();
  await getDb().$transaction(async (tx) => {
    await tx.company.update({ where: { id: company.id }, data: { entraTenantId: raw || null } });
    await recordAudit(company.id, { actor, action: "audit.access.entra_tenant", target: { kind: "company", id: company.id }, changes: { entraTenantId: { before: company.entraTenantId, after: raw || null } }, source: "console" }, tx);
  });
  revalidatePath("/admin", "layout");
  return { slug, saved: true };
}

function adminHome(): string {
  return process.env.TENANT_MODE === "subdomain" ? "" : "/admin";
}
