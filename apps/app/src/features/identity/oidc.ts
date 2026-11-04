// Generic OpenID Connect sign-in (EID D8), the pure part: discovery, the authorize URL, the token
// request and the id_token checks. No fetch, no cookies, no database. The glue is
// src/server/identity/oidc.ts. The RS256 signature check is entra.ts's verifyIdTokenSignature.
import type { IdentityClaims } from "@nextup/contracts/public";
import { decodeIdToken, idTokenKeyId, verifyIdTokenSignature, type Jwk } from "@/features/auth/entra";
import { allowedUrl, type OidcSettings } from "@/features/identity/settings";

/** Clock skew we tolerate for exp and iat. */
export const OIDC_SKEW_SECONDS = 300;

export type Discovery = { authorizationEndpoint: string; tokenEndpoint: string; jwksUri: string };

/** Where the provider publishes its configuration. A trailing slash on the issuer is not doubled. */
export const discoveryUrl = (issuer: string) => `${issuer.replace(/\/+$/, "")}/.well-known/openid-configuration`;

/** The three endpoints we use, or null when the document is not the configured issuer's or is incomplete. */
export function parseDiscovery(json: unknown, issuer: string): Discovery | null {
  if (typeof json !== "object" || json === null) return null;
  const d = json as Record<string, unknown>;
  if (d.issuer !== issuer) return null;
  const { authorization_endpoint: a, token_endpoint: t, jwks_uri: j } = d;
  if (typeof a !== "string" || typeof t !== "string" || typeof j !== "string") return null;
  if (!allowedUrl(a) || !allowedUrl(t) || !allowedUrl(j)) return null;
  return { authorizationEndpoint: a, tokenEndpoint: t, jwksUri: j };
}

export function authorizeUrlFor(p: {
  discovery: Discovery;
  clientId: string;
  redirectUri: string;
  scopes: string;
  state: string;
  nonce: string;
  challenge: string;
}): string {
  const u = new URL(p.discovery.authorizationEndpoint);
  u.searchParams.set("response_type", "code");
  u.searchParams.set("client_id", p.clientId);
  u.searchParams.set("redirect_uri", p.redirectUri);
  u.searchParams.set("scope", p.scopes);
  u.searchParams.set("state", p.state);
  u.searchParams.set("nonce", p.nonce);
  u.searchParams.set("code_challenge", p.challenge);
  u.searchParams.set("code_challenge_method", "S256");
  return u.toString();
}

/** The POST to the token endpoint. `client_secret_basic` sends the secret in a header, `_post` in the body. */
export function tokenRequest(p: {
  tokenAuth: OidcSettings["tokenAuth"];
  clientId: string;
  clientSecret: string;
  code: string;
  redirectUri: string;
  verifier: string;
}): { headers: Record<string, string>; body: string } {
  const body = new URLSearchParams({
    grant_type: "authorization_code",
    code: p.code,
    redirect_uri: p.redirectUri,
    code_verifier: p.verifier,
  });
  const headers: Record<string, string> = { "content-type": "application/x-www-form-urlencoded", accept: "application/json" };
  if (p.tokenAuth === "client_secret_post") {
    body.set("client_id", p.clientId);
    body.set("client_secret", p.clientSecret);
  } else {
    // RFC 6749 2.3.1: both parts are form-urlencoded before they are joined and base64-encoded.
    const enc = (v: string) => encodeURIComponent(v).replace(/%20/g, "+");
    headers.authorization = `Basic ${Buffer.from(`${enc(p.clientId)}:${enc(p.clientSecret)}`).toString("base64")}`;
  }
  return { headers, body: body.toString() };
}

export type OidcCheckReason = "invalid_response" | "expired" | "email_unverified";
export type OidcCheck = { ok: true; claims: IdentityClaims } | { ok: false; reason: OidcCheckReason };

export type OidcWant = {
  issuer: string;
  clientId: string;
  nonce: string;
  now?: number;
  emailClaim?: string;
  nameClaim?: string;
  departmentClaim?: string | null;
};

const EMAIL = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

/** The id_token's payload (signature already verified) against what we asked for. */
export function checkOidcIdToken(payload: Record<string, unknown> | null, want: OidcWant): OidcCheck {
  const bad = { ok: false, reason: "invalid_response" } as const;
  if (!payload) return bad;
  const now = want.now ?? Math.floor(Date.now() / 1000);
  const str = (k: string) => (typeof payload[k] === "string" ? (payload[k] as string) : "");

  if (str("iss") !== want.issuer) return bad;
  const aud = payload.aud;
  const auds = typeof aud === "string" ? [aud] : Array.isArray(aud) ? aud.filter((a): a is string => typeof a === "string") : [];
  if (!auds.includes(want.clientId)) return bad;
  if (auds.length > 1 && str("azp") !== want.clientId) return bad;
  if (typeof payload.nonce !== "string" || payload.nonce !== want.nonce) return bad;
  const exp = payload.exp;
  const iat = payload.iat;
  if (typeof exp !== "number" || typeof iat !== "number") return bad;
  if (exp + OIDC_SKEW_SECONDS < now) return { ok: false, reason: "expired" };
  if (iat - OIDC_SKEW_SECONDS > now) return bad;
  const sub = str("sub");
  if (!sub) return bad;
  if (payload.email_verified === false || payload.email_verified === "false") return { ok: false, reason: "email_unverified" };

  const claim = (name: string | null | undefined) => (name && typeof payload[name] === "string" ? (payload[name] as string).trim() : "");
  const email = claim(want.emailClaim ?? "email").toLowerCase();
  const name = claim(want.nameClaim ?? "name");
  const department = claim(want.departmentClaim ?? null);
  const validEmail = EMAIL.test(email) ? email : null;
  return {
    ok: true,
    claims: {
      issuer: want.issuer,
      subject: sub,
      email: validEmail,
      displayName: (name || validEmail || sub).slice(0, 120),
      tenantId: null,
      groups: [],
      appRoles: [],
      department: department || null,
      externalIds: {},
    },
  };
}

/** Signature (RS256 only, against `keys`) and then the claims. */
export function checkOidcJwt(jwt: unknown, keys: readonly Jwk[], want: OidcWant): OidcCheck {
  if (!idTokenKeyId(jwt) || !verifyIdTokenSignature(jwt, keys)) return { ok: false, reason: "invalid_response" };
  return checkOidcIdToken(decodeIdToken(jwt), want);
}
