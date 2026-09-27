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
import { ROLE_HOME, type Role } from "@/config/roles";
import { hashLoginCode, looksLikeLoginCode, looksLikeSharedCode, normalizeLoginCode } from "@/features/auth/login-code";
import { getDb, hasDatabase, orDemo } from "@/lib/db/client";
import { findTenant, findTenantByEmail } from "@/features/tenant";
import { normaliseSlug } from "@/features/tenant/create";
import { tenantMode, companyUrl } from "@/features/tenant/urls";
import { demoLoginOpen, demoPersonOf } from "@/server/demo-login";
import { companyPrefix, safeNext } from "@/server/microsoft-login";
import { clearSession, issueSession } from "@/server/issue-session";
import { clientKey, forgive, throttle } from "@/server/throttle";

export type LoginState = { error?: string };

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
  const blocked = throttle("loginCode", `${who}|${slug}`) ?? throttle("loginCodeAll", slug);
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
        include: { company: { select: { id: true, slug: true } } },
      }),
    () => null,
  );
  if (!hasDatabase()) return noDatabase;
  // A code for another company is simply a wrong code here - never "it belongs to X".
  if (!user || user.company.slug !== slug) return wrongCode;
  forgive("loginCode", `${who}|${slug}`);

  await issueSession(user.company.id, user.company.slug, user);
  redirect(companyPrefix(slug) + (safeNext(String(form.get("next") ?? "")) || ROLE_HOME[user.role as Role]));
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

  await issueSession(company.id, company.slug, user);
  redirect(companyPrefix(slug) + (next || ROLE_HOME[user.role as Role]));
}

export type FindState = { error?: string; email?: string; company?: string };

/** Login step 1: a work email or a company name -> that company's login page. */
export async function findCompany(_prev: FindState, form: FormData): Promise<FindState> {
  const email = String(form.get("email") ?? "").trim();
  const company = String(form.get("company") ?? "").trim();
  const back = { email, company };
  if (!email && !company) return { ...back, error: "Enter your work email or your company's NextUp name." };

  const blocked = throttle("findCompany", await clientKey());
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
  redirect(tenantMode() === "subdomain" ? `${companyUrl(tenant.slug)}/login` : `/${tenant.slug}/login`);
}

export async function signOut(slug: string) {
  await clearSession();
  redirect(companyPrefix(slug) + "/login");
}
