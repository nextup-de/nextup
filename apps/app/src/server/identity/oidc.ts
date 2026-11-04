// Generic OpenID Connect sign-in (EID D8): the IdentityProvider adapter and the two steps the routes
// call. Authorization code + PKCE S256; state, nonce, verifier, next and the test flag travel in the
// signed flow cookie `nextup_oidc_flow`. Pure parts: src/features/identity/oidc.ts. Not "use server".
import { cookies } from "next/headers";
import type { IdentityClaims, IdentityProvider, LoginCallback, LoginStart } from "@nextup/contracts/public";
import { holdsRealPeople } from "@/features/admin/stages";
import {
  FLOW_TTL_SECONDS, pkcePair, randomToken, sameToken, signFlow, verifyFlow, type Flow, type Jwk,
} from "@/features/auth/entra";
import { integrationContext, open, vaultKey } from "@/features/connectors/vault";
import {
  authorizeUrlFor, checkOidcJwt, discoveryUrl, parseDiscovery, tokenRequest, type Discovery,
} from "@/features/identity/oidc";
import { parseOidcSettings, type OidcSettings } from "@/features/identity/settings";
import { companyOrigin, companyPrefix } from "@/features/tenant/urls";
import { getDb, hasDatabase } from "@/lib/db/client";
import { getIntegration, integrationSecrets } from "@/lib/db/integrations";
import { secureCookies } from "@/server/issue-session";
import { SsoError, finishSsoLogin, loginErrorUrl, storeFailedTest, type SsoErrorCode } from "@/server/identity/finish";
import { safeNext } from "@/server/microsoft-login";

export const OIDC_FLOW_COOKIE = "nextup_oidc_flow";
const TIMEOUT_MS = 10_000;
const CACHE_MS = 60 * 60 * 1000;

type OidcFlow = Flow & { test?: boolean };
type Config = { settings: OidcSettings; secret: string };

const discoveryCache = new Map<string, { at: number; value: Discovery }>();
const jwksCache = new Map<string, { at: number; keys: Jwk[] }>();

async function getJson(url: string): Promise<unknown> {
  const res = await fetch(url, { cache: "no-store", signal: AbortSignal.timeout(TIMEOUT_MS), headers: { accept: "application/json" } });
  if (!res.ok) throw new Error(`${new URL(url).pathname} ${res.status}`);
  return res.json();
}

async function discover(issuer: string): Promise<Discovery> {
  const hit = discoveryCache.get(issuer);
  if (hit && Date.now() - hit.at < CACHE_MS) return hit.value;
  const found = parseDiscovery(await getJson(discoveryUrl(issuer)), issuer);
  if (!found) throw new SsoError("invalid_response");
  discoveryCache.set(issuer, { at: Date.now(), value: found });
  return found;
}

async function signingKeys(jwksUri: string, fresh: boolean): Promise<Jwk[]> {
  const hit = jwksCache.get(jwksUri);
  if (hit && !fresh && Date.now() - hit.at < CACHE_MS) return hit.keys;
  const body = (await getJson(jwksUri)) as { keys?: Jwk[] };
  const keys = Array.isArray(body.keys) ? body.keys : [];
  jwksCache.set(jwksUri, { at: Date.now(), keys });
  return keys;
}

/** The key id in the token's header, whatever the algorithm - only used to decide on a refetch. */
function headerKid(jwt: unknown): string | null {
  try {
    const h = JSON.parse(Buffer.from(String(jwt).split(".")[0] ?? "", "base64url").toString("utf8")) as { kid?: unknown };
    return typeof h.kid === "string" ? h.kid : null;
  } catch {
    return null;
  }
}

async function configOf(companyId: string): Promise<Config | null> {
  const row = await getIntegration(companyId, "oidc");
  if (!row || !row.on) return null;
  const parsed = parseOidcSettings(row.settings);
  const key = vaultKey();
  const sealed = (await integrationSecrets(companyId, "oidc"))?.secretSealed;
  if (!parsed.ok || !key || !sealed) return null;
  const secret = open(sealed, key, integrationContext(companyId, "oidc"));
  return secret ? { settings: parsed.value, secret } : null;
}

/** Same shape as microsoftCallbackUrl, for an explicit origin. */
export const oidcCallbackUrl = (origin: string, slug: string) => `${origin}${companyPrefix(slug)}/login/oidc/callback`;
const redirectUriFor = (slug: string) => oidcCallbackUrl(companyOrigin(slug), slug);

function flowCookieOptions(maxAge: number) {
  return { httpOnly: true, sameSite: "lax" as const, path: "/", secure: secureCookies(), maxAge };
}

export type OidcCompleted = { claims: IdentityClaims; next: string; test: boolean };

/** The adapter plus the flow-aware completion the callback route needs (next, test). */
export type OidcProvider = IdentityProvider & {
  startLogin(input: { companyId: string; returnTo: string; test?: boolean }): Promise<LoginStart>;
  complete(input: LoginCallback): Promise<OidcCompleted>;
};

/** Null when the row is missing, off or unparsable, or its secret does not open. */
export async function oidcProvider(companyId: string): Promise<OidcProvider | null> {
  if (!hasDatabase()) return null;
  const config = await configOf(companyId);
  if (!config) return null;
  const { settings, secret } = config;
  const company = await getDb().company.findUnique({ where: { id: companyId }, select: { slug: true } });
  if (!company) return null;
  const slug = company.slug;
  const authSecret = process.env.AUTH_SECRET;

  const complete = async (input: LoginCallback): Promise<OidcCompleted> => {
    const jar = await cookies();
    const raw = jar.get(OIDC_FLOW_COOKIE)?.value;
    jar.set(OIDC_FLOW_COOKIE, "", flowCookieOptions(0)); // one use only, whatever happens next
    const flow = authSecret ? (verifyFlow(raw, authSecret) as OidcFlow | null) : null;
    const test = flow?.test === true;
    try {
      if (!flow || flow.as !== undefined || flow.slug !== slug) throw new SsoError(raw ? "expired" : "state");
      if (!sameToken(input.state, flow.state)) throw new SsoError("state");
      if (input.params.error) {
        console.warn(`[oidc] ${slug}: provider returned ${input.params.error}`.slice(0, 300));
        throw new SsoError("invalid_response");
      }
      const code = input.params.code;
      if (!code) throw new SsoError("invalid_response");

      const discovery = await discover(settings.issuer);
      const req = tokenRequest({
        tokenAuth: settings.tokenAuth, clientId: settings.clientId, clientSecret: secret, code,
        redirectUri: redirectUriFor(slug), verifier: flow.verifier,
      });
      const res = await fetch(discovery.tokenEndpoint, {
        method: "POST", headers: req.headers, body: req.body, cache: "no-store", signal: AbortSignal.timeout(TIMEOUT_MS),
      });
      const body = (await res.json().catch(() => ({}))) as { id_token?: unknown; error?: unknown };
      if (!res.ok || typeof body.id_token !== "string") {
        console.warn(`[oidc] ${slug}: token endpoint ${res.status} ${typeof body.error === "string" ? body.error : ""}`);
        throw new SsoError("invalid_response");
      }

      const want = {
        issuer: settings.issuer, clientId: settings.clientId, nonce: flow.nonce,
        emailClaim: settings.emailClaim, nameClaim: settings.nameClaim, departmentClaim: settings.departmentClaim,
      };
      let keys = await signingKeys(discovery.jwksUri, false);
      const kid = headerKid(body.id_token);
      if (kid && !keys.some((k) => k.kid === kid)) keys = await signingKeys(discovery.jwksUri, true); // a rollover: one refetch
      const checked = checkOidcJwt(body.id_token, keys, want);
      if (!checked.ok) throw new SsoError(checked.reason);
      return { claims: checked.claims, next: flow.next, test };
    } catch (err) {
      if (err instanceof SsoError) throw new SsoError(err.code, test);
      console.warn(`[oidc] ${slug}: sign-in failed`, err);
      throw new SsoError("failed", test);
    }
  };

  return {
    info: { kind: "IdentityProvider", id: "oidc", contractVersion: 1 },
    async startLogin({ returnTo, test }: { companyId: string; returnTo: string; test?: boolean }) {
      if (!authSecret) throw new SsoError("failed");
      const discovery = await discover(settings.issuer).catch(() => {
        throw new SsoError("failed");
      });
      const { verifier, challenge } = pkcePair();
      const state = randomToken();
      const nonce = randomToken();
      const exp = Math.floor(Date.now() / 1000) + FLOW_TTL_SECONDS;
      const flow: OidcFlow = { slug, state, nonce, verifier, next: safeNext(returnTo), exp, ...(test ? { test: true } : {}) };
      (await cookies()).set(OIDC_FLOW_COOKIE, signFlow(flow, authSecret), flowCookieOptions(FLOW_TTL_SECONDS));
      return {
        state,
        redirectUrl: authorizeUrlFor({
          discovery, clientId: settings.clientId, redirectUri: redirectUriFor(slug), scopes: settings.scopes, state, nonce, challenge,
        }),
      };
    },
    async completeLogin(input) {
      return (await complete(input)).claims;
    },
    complete,
  };
}

async function companyBySlug(slug: string): Promise<{ id: string; stage: string } | null> {
  if (!hasDatabase()) return null;
  return getDb().company.findUnique({ where: { slug }, select: { id: true, stage: true } });
}

/** Step 1. `test` has been checked by the route (a company admin's session). Returns where to redirect. */
export async function startOidcLogin(slug: string, next: string | null, test: boolean): Promise<string> {
  const company = await companyBySlug(slug);
  if (!company) return loginErrorUrl(slug, "not_on");
  if (!holdsRealPeople(company.stage)) return loginErrorUrl(slug, "demo_company");
  const provider = await oidcProvider(company.id);
  if (!provider) return loginErrorUrl(slug, "not_on");
  try {
    return (await provider.startLogin({ companyId: company.id, returnTo: next ?? "", test })).redirectUrl;
  } catch (err) {
    const code: SsoErrorCode = err instanceof SsoError ? err.code : "failed";
    console.warn(`[oidc] ${slug}: could not start`, err instanceof SsoError ? code : err);
    return loginErrorUrl(slug, code);
  }
}

/** Step 2. Returns where to redirect: home, the login page with a reason, or the settings card after a test. */
export async function finishOidcLogin(slug: string, origin: string, params: URLSearchParams): Promise<string> {
  const company = await companyBySlug(slug);
  if (!company) return loginErrorUrl(slug, "not_on");
  const provider = await oidcProvider(company.id);
  if (!provider) {
    (await cookies()).set(OIDC_FLOW_COOKIE, "", flowCookieOptions(0));
    return loginErrorUrl(slug, "not_on");
  }
  let done: OidcCompleted;
  try {
    done = await provider.complete({ state: params.get("state") ?? "", params: Object.fromEntries(params.entries()) });
  } catch (err) {
    const code: SsoErrorCode = err instanceof SsoError ? err.code : "failed";
    // A failed test is stored on the card like any other result.
    return err instanceof SsoError && err.test ? storeFailedTest(company.id, slug, "oidc", code) : loginErrorUrl(slug, code);
  }
  const { redirect } = await finishSsoLogin({
    companyId: company.id, slug, provider: "oidc", claims: done.claims, test: done.test, origin, next: done.next,
  });
  return redirect;
}
