"use server";
// Sign in and out.
//
// Each person has their OWN way in, and it alone says who they are:
//   - a personal login code (User.loginCodeHash, src/features/auth/login-code.ts), handed out by
//     /admin - one step, nothing to pick;
//   - "Continue with Microsoft" for companies on Entra (route handlers, src/server/microsoft-login.ts).
// The old shared company code + "who are you?" list is gone: with it, anyone holding the code
// could pick any name - the manager's included - and the whole staff list went to the browser.
//
// Demo boxes keep a one-click "open the demo" button (demoSignIn below) - but only with
// LOGIN_DEMO_FILL set on the server AND for a company still in demo stage, whose people are made up.
import { redirect } from "next/navigation";
import { hashLoginCode, looksLikeLoginCode, looksLikeSharedCode, normalizeLoginCode } from "@/features/auth/login-code";
import { generateTotpSecret, base32Decode, otpauthUrl, totpContext, verifyTotp } from "@/features/auth/totp";
import { open, seal, vaultKey } from "@/features/connectors/vault";
import { getT } from "@/i18n/server";
import { getDb, hasDatabase, orDemo } from "@/lib/db/client";
import { findTenant, findTenantByEmail } from "@/features/tenant";
import { normaliseSlug } from "@/features/tenant/create";
import { tenantMode, companyUrl } from "@/features/tenant/urls";
import { demoLoginOpen, demoPersonOf } from "@/server/demo-login";
import { companyPrefix, safeNext } from "@/server/microsoft-login";
import { clearSession, issueSession } from "@/server/issue-session";
import { entryFor, homeOf } from "@/server/setup-open";
import { clientKey, forgive, throttle } from "@/server/throttle";

/**
 * `step` is set when the code was right but a manager still owes the second factor: "totp" asks for
 * the authenticator code, "enrol" shows the key (`secret`, `otpauth`) to set one up first.
 */
export type LoginState = { error?: string; step?: "totp" | "enrol"; secret?: string; otpauth?: string };

const noDatabase: LoginState = {
  error: "No database is connected, so there is nobody to sign in as. The demo works without one.",
};

const wrongCode: LoginState = {
  error: "That code doesn't open this company. Check for a typo, or ask your team leader for a new one.",
};

/** The personal-code login: one field, one step. */
export async function codeLogin(_prev: LoginState, form: FormData): Promise<LoginState> {
  const slug = String(form.get("slug") ?? "");
  const raw = String(form.get("code") ?? "");
  const code = normalizeLoginCode(raw);
  if (!code) return { error: "Enter your personal login code. Your team leader has it." };

  if (!hasDatabase()) return noDatabase;

  // Every attempt counts, well-formed or not (src/server/throttle.ts).
  const who = await clientKey();
  const blocked = (await throttle("loginCode", `${who}|${slug}`)) ?? (await throttle("loginCodeAll", slug));
  if (blocked) return { error: blocked };

  if (!looksLikeLoginCode(code, slug)) {
    // "acme-7f3k-92xd": the shared company code people were given before personal codes.
    if (looksLikeSharedCode(code, slug)) {
      return { error: "That's the old shared company code. Everyone has their own code now - ask your team leader for yours." };
    }
    return wrongCode;
  }

  const user = await orDemo(
    () =>
      getDb().user.findUnique({
        where: { loginCodeHash: hashLoginCode(code) },
        include: { company: { select: { id: true, slug: true, name: true } } },
      }),
    () => null,
  );
  if (!hasDatabase()) return noDatabase;
  // A code for another company is simply a wrong code here - never "it belongs to X".
  if (!user || !user.active || user.company.slug !== slug) return wrongCode;

  // Closed until opened (features/pilot/open.ts): the code is right, but only setup people get in yet.
  const entry = await entryFor(user.company.id, user);
  if (entry === "refused") return { error: (await getT())("settingsSetupOpen.refused", { company: user.company.name }) };

  // A manager needs a second factor; members and leaders sign in with the code alone.
  if (user.role === "manager") {
    const gate = await managerSecondFactor(user, slug, form);
    if (gate) return gate;
  }
  await forgive("loginCode", `${who}|${slug}`);

  await issueSession(user.company.id, user.company.slug, user);
  redirect(companyPrefix(slug) + (safeNext(String(form.get("next") ?? "")) || homeOf(entry, user.role)));
}

type Manager = { id: string; companyId: string; email: string; totpSecretSealed: string | null; totpEnabledAt: Date | null };

/**
 * Null when the manager may have a session; otherwise the step to show. Enrolled: the TOTP code is
 * needed. Not enrolled: the key is shown first, and one right code from it stores the secret
 * (sealed) and lets them in. Time is Date.now(), so a test pins it with fake timers.
 */
async function managerSecondFactor(user: Manager, slug: string, form: FormData): Promise<LoginState | null> {
  const t = await getT();
  const key = vaultKey();
  if (!key) return { error: t("adminAccess.vaultMissing") };
  const context = totpContext(user.companyId, user.id);
  const given = String(form.get("totp") ?? "");

  if (user.totpEnabledAt && user.totpSecretSealed) {
    if (!given.trim()) return { step: "totp" };
    const secret = open(user.totpSecretSealed, key, context);
    if (!secret || !verifyTotp(secret, given, Date.now())) return { step: "totp", error: t("adminAccess.totpWrong") };
    return null;
  }

  // Not enrolled. The key travels with the form between the two steps; it only counts once a code
  // made from it is entered, and never replaces a secret that is already confirmed.
  const posted = String(form.get("secret") ?? "");
  const known = /^[A-Z2-7]{32}$/.test(posted) && base32Decode(posted) ? posted : null;
  const secret = known ?? generateTotpSecret();
  const show = { step: "enrol" as const, secret, otpauth: otpauthUrl("NextUp", user.email || slug, secret) };
  if (!known) return show;
  if (!given.trim()) return { ...show, error: t("adminAccess.totpRequired") };
  if (!verifyTotp(secret, given, Date.now())) return { ...show, error: t("adminAccess.totpWrong") };

  const stored = await getDb().user.updateMany({
    where: { id: user.id, companyId: user.companyId, totpEnabledAt: null },
    data: { totpSecretSealed: seal(secret, key, context), totpEnabledAt: new Date() },
  });
  return stored.count === 1 ? null : { step: "totp" };
}

/** Demo boxes only: become one of a demo company's made-up people in one click. */
export async function demoSignIn(form: FormData): Promise<void> {
  const slug = String(form.get("slug") ?? "");
  const next = safeNext(String(form.get("next") ?? ""));

  // Re-checked here, not trusted from the page that rendered the button - and the person is
  // chosen here too: the form names no one.
  const company = await demoLoginOpen(slug);
  const user = company ? demoPersonOf(company) : null;
  if (!company || !user) redirect(companyPrefix(slug) + "/login");
  const entry = await entryFor(company.id, { role: user.role, active: true, isStackAdmin: false });
  if (entry === "refused") redirect(companyPrefix(slug) + "/login");

  await issueSession(company.id, company.slug, user);
  redirect(companyPrefix(slug) + (next || homeOf(entry, user.role)));
}

export type FindState = { error?: string; email?: string; company?: string };

/** Login step 1: a work email or a company name -> that company's login page. */
export async function findCompany(_prev: FindState, form: FormData): Promise<FindState> {
  const email = String(form.get("email") ?? "").trim();
  const company = String(form.get("company") ?? "").trim();
  const back = { email, company };
  if (!email && !company) return { ...back, error: "Enter your work email or your company's NextUp name." };

  const blocked = await throttle("findCompany", await clientKey());
  if (blocked) return { ...back, error: blocked };

  // The name wins when both are filled in: it is the more deliberate of the two.
  const tenant = company ? await findTenant(normaliseSlug(company)) : await findTenantByEmail(email.toLowerCase());
  if (!tenant) {
    return {
      ...back,
      error: company
        ? `No company called "${company}" on NextUp. Check the short name in your invitation link.`
        : "We don't know that email domain. Try your company's NextUp name instead.",
    };
  }
  redirect(tenantMode() === "subdomain" ? `${companyUrl(tenant.slug)}/login` : `${companyPrefix(tenant.slug)}/login`);
}

export async function signOut(slug: string) {
  await clearSession();
  redirect(companyPrefix(slug) + "/login");
}
