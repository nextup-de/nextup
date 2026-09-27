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
  isTenantId,
  pkcePair,
  randomToken,
  sameToken,
  signFlow,
  tokenRequestBody,
  tokenUrl,
  verifyFlow,
  type MicrosoftError,
} from "@/features/auth/entra";
import { getDb, hasDatabase, orDemo } from "@/lib/db/client";
import { safeNextPath } from "@/features/tenant/urls";
import { issueSession, secureCookies } from "@/server/issue-session";

/** In subdomain mode the company IS the host, so its paths carry no slug. */
export function companyPrefix(slug: string): string {
  return process.env.TENANT_MODE === "subdomain" ? "" : "/" + slug;
}

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
export async function startMicrosoftLogin(slug: string, origin: string, next: string | null): Promise<string> {
  const app = entraApp();
  const secret = process.env.AUTH_SECRET;
  const company = await tenantOf(slug);
  if (!app || !secret || !company) return loginWithError(slug, "off");

  const { verifier, challenge } = pkcePair();
  const state = randomToken();
  const nonce = randomToken();
  const exp = Math.floor(Date.now() / 1000) + FLOW_TTL_SECONDS;

  (await cookies()).set(
    FLOW_COOKIE,
    signFlow({ slug, state, nonce, verifier, next: safeNext(next), exp }, secret),
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

/** Returns the URL to redirect to: the person's home on success, the login page with a reason otherwise. */
export async function finishMicrosoftLogin(slug: string, origin: string, params: URLSearchParams): Promise<string> {
  const jar = await cookies();
  const raw = jar.get(FLOW_COOKIE)?.value;
  // One use only, whatever happens next.
  jar.set(FLOW_COOKIE, "", flowCookieOptions(0));

  const app = entraApp();
  const secret = process.env.AUTH_SECRET;
  const company = await tenantOf(slug);
  if (!app || !secret || !company) return loginWithError(slug, "off");

  // The person pressed Cancel, or their admin has not consented to the app.
  if (params.get("error")) {
    console.warn(`[microsoft] ${slug}: ${params.get("error")} ${params.get("error_description") ?? ""}`.slice(0, 300));
    return loginWithError(slug, params.get("error") === "access_denied" ? "cancelled" : "failed");
  }

  const flow = verifyFlow(raw, secret);
  if (!flow) return loginWithError(slug, raw ? "expired" : "state");
  if (flow.slug !== slug || !sameToken(params.get("state") ?? "", flow.state)) return loginWithError(slug, "state");

  const code = params.get("code");
  if (!code) return loginWithError(slug, "token");

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
      return loginWithError(slug, "failed");
    }
    idToken = body.id_token;
  } catch (err) {
    console.warn(`[microsoft] ${slug}: token request failed`, err);
    return loginWithError(slug, "failed");
  }

  const checked = checkIdToken(decodeIdToken(idToken), {
    clientId: app.clientId,
    tenantId: company.entraTenantId,
    nonce: flow.nonce,
  });
  if (!checked.ok) return loginWithError(slug, checked.reason);
  const { oid, email } = checked.who;

  const db = getDb();
  // Bound account first; the email only finds someone who has never used Microsoft here - and
  // only if no other Microsoft account has claimed that person already.
  const user =
    (await db.user.findFirst({ where: { companyId: company.id, entraOid: oid } })) ??
    (email ? await db.user.findFirst({ where: { companyId: company.id, email, entraOid: null } }) : null);
  if (!user) {
    console.warn(`[microsoft] ${slug}: no person for ${email || "(no email)"}`);
    return loginWithError(slug, "unknown");
  }
  if (!user.entraOid) await db.user.update({ where: { id: user.id, companyId: company.id }, data: { entraOid: oid } });

  await issueSession(company.id, company.slug, user);
  return companyPrefix(slug) + (flow.next || ROLE_HOME[user.role as Role]);
}
