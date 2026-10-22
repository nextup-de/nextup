// "Continue with Microsoft" - the glue between the two route handlers under
// src/app/[company]/login/microsoft/ and the pure flow in src/features/auth/entra.ts.
//
//   start:    GET /<company>/login/microsoft           -> sets the flow cookie, 302 to Microsoft
//   callback: GET /<company>/login/microsoft/callback  -> checks it all, sets the session, 302 home
//
// Both live under /login/ because the proxy always lets /login/* through (features/auth/request.ts).
// The redirect URI is per company ("<company home>/login/microsoft/callback"), so every company's
// callback has to be added to the Entra app registration - /admin shows the exact URL.
//
// Not a "use server" module: helpers the route handlers call, not actions.
import { cookies } from "next/headers";
import { ROLE_HOME, type Role } from "@/config/roles";
import {
  authorizeUrl,
  checkIdToken,
  decodeIdToken,
  entraApp,
  FLOW_COOKIE,
  FLOW_TTL_SECONDS,
  idTokenKeyId,
  isEntraAdmin,
  isTenantId,
  jwksUrl,
  landingFor,
  pkcePair,
  randomToken,
  roleFromEntra,
  sameToken,
  signFlow,
  tokenRequestBody,
  tokenUrl,
  verifyFlow,
  verifyIdTokenSignature,
  type Jwk,
  type MicrosoftError,
} from "@/features/auth/entra";
import { getDb, hasDatabase, orDemo } from "@/lib/db/client";
import { adminScope } from "@/features/admin/nav";
import { initialsOf } from "@/features/tenant/create";
import { companyPrefix, safeNextPath } from "@/features/tenant/urls";
import { issueAdminSession } from "@/server/admin-session";
import { issueSession, secureCookies } from "@/server/issue-session";

export { companyPrefix };

/** Where Microsoft sends people back to. Must match the app registration exactly. */
export function microsoftCallbackUrl(origin: string, slug: string): string {
  return `${origin}${companyPrefix(slug)}/login/microsoft/callback`;
}

/** A same-site path to continue to, or "" - never another host (open redirect). */
export function safeNext(next: string | null | undefined): string {
  return safeNextPath(next ?? "") ?? "";
}

async function tenantOf(slug: string): Promise<{ id: string; slug: string; entraTenantId: string } | null> {
  if (!hasDatabase()) return null;
  const c = await orDemo(
    () => getDb().company.findUnique({ where: { slug }, select: { id: true, slug: true, entraTenantId: true } }),
    () => null,
  );
  return c && isTenantId(c.entraTenantId) ? { id: c.id, slug: c.slug, entraTenantId: c.entraTenantId } : null;
}

/** Is the "Continue with Microsoft" button worth showing for this company on this server? */
export async function microsoftEnabledFor(slug: string): Promise<boolean> {
  return Boolean(entraApp() && process.env.AUTH_SECRET && (await tenantOf(slug)));
}

const loginWithError = (slug: string, reason: MicrosoftError) => `${companyPrefix(slug)}/login?error=${reason}`;

// A company stack's own /admin, which Microsoft can also unlock (the NextUp.Admin app role).
const adminHome = () => (process.env.TENANT_MODE === "subdomain" ? "" : "/admin");
const adminLoginError = (reason: MicrosoftError) => `${adminHome()}/login?error=${reason}`;

/** Only a one-company stack has an admin of its own, and only for its own company. */
const isThisStacksAdmin = (slug: string) => adminScope() === "company" && process.env.COMPANY_SLUG?.trim() === slug;

/** The Microsoft button on /admin/login: shown when Microsoft sign-in works for this stack's company. */
export async function microsoftAdminEnabled(): Promise<boolean> {
  const slug = process.env.COMPANY_SLUG?.trim();
  return Boolean(slug && isThisStacksAdmin(slug) && (await microsoftEnabledFor(slug)));
}

function flowCookieOptions(maxAge: number) {
  return {
    httpOnly: true,
    // lax, not strict: the callback is a top-level navigation coming FROM Microsoft, and a strict
    // cookie would not travel on it.
    sameSite: "lax" as const,
    path: "/",
    secure: secureCookies(),
    maxAge,
  };
}

/** Returns the URL to redirect to: Microsoft on success, back to the login page otherwise. */
export async function startMicrosoftLogin(
  slug: string,
  origin: string,
  next: string | null,
  asAdmin = false,
): Promise<string> {
  const app = entraApp();
  const secret = process.env.AUTH_SECRET;
  const company = await tenantOf(slug);
  if (asAdmin && !isThisStacksAdmin(slug)) return loginWithError(slug, "off");
  if (!app || !secret || !company) return asAdmin ? adminLoginError("off") : loginWithError(slug, "off");

  const { verifier, challenge } = pkcePair();
  const state = randomToken();
  const nonce = randomToken();
  const exp = Math.floor(Date.now() / 1000) + FLOW_TTL_SECONDS;

  (await cookies()).set(
    FLOW_COOKIE,
    signFlow({ slug, state, nonce, verifier, next: safeNext(next), exp, ...(asAdmin ? { as: "admin" as const } : {}) }, secret),
    flowCookieOptions(FLOW_TTL_SECONDS),
  );

  return authorizeUrl({
    tenantId: company.entraTenantId,
    clientId: app.clientId,
    redirectUri: microsoftCallbackUrl(origin, slug),
    state,
    nonce,
    challenge,
  });
}

/** A tenant's signing keys, kept for an hour. Microsoft rolls keys over every few weeks. */
const KEY_TTL_MS = 60 * 60 * 1000;
const keyCache = new Map<string, { keys: Jwk[]; at: number }>();

async function signingKeys(tenantId: string, fresh: boolean): Promise<Jwk[]> {
  const hit = keyCache.get(tenantId);
  if (hit && !fresh && Date.now() - hit.at < KEY_TTL_MS) return hit.keys;
  const res = await fetch(jwksUrl(tenantId), { cache: "no-store", signal: AbortSignal.timeout(10_000) });
  if (!res.ok) throw new Error(`jwks ${res.status}`);
  const body = (await res.json()) as { keys?: Jwk[] };
  const keys = Array.isArray(body.keys) ? body.keys : [];
  keyCache.set(tenantId, { keys, at: Date.now() });
  return keys;
}

/** Signed by this tenant? A key id we do not know gets one refetch (a rollover), not more. */
async function idTokenIsSigned(jwt: unknown, tenantId: string): Promise<boolean> {
  const kid = idTokenKeyId(jwt);
  if (!kid) return false;
  let keys = await signingKeys(tenantId, false);
  if (!keys.some((k) => k.kid === kid)) keys = await signingKeys(tenantId, true);
  return verifyIdTokenSignature(jwt, keys);
}

/** Returns the URL to redirect to: the person's home on success, the login page with a reason otherwise. */
export async function finishMicrosoftLogin(slug: string, origin: string, params: URLSearchParams): Promise<string> {
  const jar = await cookies();
  const raw = jar.get(FLOW_COOKIE)?.value;
  // One use only, whatever happens next.
  jar.set(FLOW_COOKIE, "", flowCookieOptions(0));

  const app = entraApp();
  const secret = process.env.AUTH_SECRET;
  const company = await tenantOf(slug);
  // Read first, so a failure goes back to the page the person started from: /admin or the login.
  const flow = secret ? verifyFlow(raw, secret) : null;
  const fail = (reason: MicrosoftError) => (flow?.as === "admin" ? adminLoginError(reason) : loginWithError(slug, reason));
  if (!app || !secret || !company) return fail("off");

  // The person pressed Cancel, or their admin has not consented to the app.
  if (params.get("error")) {
    console.warn(`[microsoft] ${slug}: ${params.get("error")} ${params.get("error_description") ?? ""}`.slice(0, 300));
    return fail(params.get("error") === "access_denied" ? "cancelled" : "failed");
  }

  if (!flow) return fail(raw ? "expired" : "state");
  if (flow.slug !== slug || !sameToken(params.get("state") ?? "", flow.state)) return fail("state");

  const code = params.get("code");
  if (!code) return fail("token");

  let idToken: unknown;
  try {
    const res = await fetch(tokenUrl(company.entraTenantId), {
      method: "POST",
      headers: { "content-type": "application/x-www-form-urlencoded" },
      body: tokenRequestBody({
        clientId: app.clientId,
        clientSecret: app.clientSecret,
        code,
        redirectUri: microsoftCallbackUrl(origin, slug),
        verifier: flow.verifier,
      }),
      cache: "no-store",
      signal: AbortSignal.timeout(10_000),
    });
    const body = (await res.json()) as { id_token?: unknown; error?: string; error_description?: string };
    if (!res.ok) {
      console.warn(`[microsoft] ${slug}: token endpoint ${res.status} ${body.error ?? ""}`);
      return fail("failed");
    }
    idToken = body.id_token;
  } catch (err) {
    console.warn(`[microsoft] ${slug}: token request failed`, err);
    return fail("failed");
  }

  try {
    if (!(await idTokenIsSigned(idToken, company.entraTenantId))) {
      console.warn(`[microsoft] ${slug}: ID token signature not valid`);
      return fail("token");
    }
  } catch (err) {
    console.warn(`[microsoft] ${slug}: could not fetch signing keys`, err);
    return fail("failed");
  }

  try {
    if (!(await idTokenIsSigned(idToken, company.entraTenantId))) {
      console.warn(`[microsoft] ${slug}: ID token signature not valid`);
      return loginWithError(slug, "token");
    }
  } catch (err) {
    console.warn(`[microsoft] ${slug}: could not fetch signing keys`, err);
    return loginWithError(slug, "failed");
  }

  const checked = checkIdToken(decodeIdToken(idToken), {
    clientId: app.clientId,
    tenantId: company.entraTenantId,
    nonce: flow.nonce,
  });
  if (!checked.ok) return fail(checked.reason);
  const { oid, email, name } = checked.who;

  // /admin: the customer's IT decides who, with the NextUp.Admin app role. No NextUp account needed.
  if (flow.as === "admin") {
    if (!isThisStacksAdmin(slug)) return fail("off");
    if (!isEntraAdmin(checked.who.roles)) {
      console.warn(`[admin] ${email || oid} tried Microsoft sign-in without the NextUp.Admin role`);
      return fail("noadmin");
    }
    await issueAdminSession(email || name || oid);
    console.info(`[admin] ${email || oid} signed in with Microsoft`);
    return adminHome() || "/";
  }

  const db = getDb();
  // Bound account first; the email only finds someone who has never used Microsoft here - and
  // only if no other Microsoft account has claimed that person already.
  const found =
    (await db.user.findFirst({ where: { companyId: company.id, entraOid: oid } })) ??
    (email ? await db.user.findFirst({ where: { companyId: company.id, email, entraOid: null } }) : null);
  const emailTaken =
    !found && email ? Boolean(await db.user.findFirst({ where: { companyId: company.id, email }, select: { id: true } })) : false;

  const landing = landingFor({ found, emailTaken, email, role: roleFromEntra(checked.who.roles) });
  if (landing.kind === "refuse") {
    console.warn(`[microsoft] ${slug}: ${landing.reason} for ${email || "(no email)"}`);
    return fail(landing.reason);
  }

  let user = found;
  if (landing.kind === "create") {
    // The customer's IT assigned this person a NextUp role in Entra: that is the invitation.
    const display = name.trim() || email.split("@")[0];
    try {
      user = await db.user.create({
        data: { companyId: company.id, name: display, email, role: landing.role, ini: initialsOf(display), entraOid: oid },
      });
    } catch (err) {
      console.warn(`[microsoft] ${slug}: could not create ${email}`, err);
      return fail("failed");
    }
    console.info(`[microsoft] ${slug}: created ${email} as ${landing.role}`);
  } else if (found) {
    // Bind the Microsoft account on first sight; take the role Entra assigns, if it assigns one.
    const data = { ...(found.entraOid ? {} : { entraOid: oid }), ...(landing.setRole ? { role: landing.setRole } : {}) };
    if (Object.keys(data).length > 0) {
      user = await db.user.update({ where: { id: found.id, companyId: company.id }, data });
      if (landing.setRole) console.info(`[microsoft] ${slug}: ${email} is now ${landing.setRole} (was ${found.role})`);
    }
  }
  if (!user) return fail("failed");

  await issueSession(company.id, company.slug, user);
  return companyPrefix(slug) + (flow.next || ROLE_HOME[user.role as Role]);
}
