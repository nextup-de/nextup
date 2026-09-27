// "Continue with Microsoft" - OpenID Connect against Microsoft Entra ID, authorization code flow
// with PKCE. No library: the whole flow is two redirects and one POST, and every check we rely on
// is below and unit-tested.
//
// Why no signature check on the ID token: we never accept one from the browser. It comes back
// from our own server-to-server POST to Microsoft's token endpoint over TLS, which OpenID Connect
// Core 3.1.3.7 allows in place of verifying the signature. We still check iss, aud, tid, nonce
// and expiry.
//
// Tenant isolation: a company opts in by storing its Entra tenant ID (Company.entraTenantId).
// The authorize URL is sent to THAT tenant only, and the token's `tid` must match it - so an
// account from any other organisation, or a personal Microsoft account, cannot sign in to it.
//
// Pure: node:crypto only. The glue that reads cookies and redirects is src/server/microsoft-login.ts.
import { createHash, createHmac, randomBytes, timingSafeEqual } from "node:crypto";

export const MICROSOFT_AUTHORITY = "https://login.microsoftonline.com";
export const FLOW_COOKIE = "nextup_ms_flow";
/** Ten minutes to get through Microsoft's screens, MFA included. */
export const FLOW_TTL_SECONDS = 10 * 60;

export type EntraApp = { clientId: string; clientSecret: string };

/** The app registration, or null when Microsoft sign-in is not set up on this server. */
export function entraApp(env: Record<string, string | undefined> = process.env): EntraApp | null {
  const clientId = env.ENTRA_CLIENT_ID?.trim();
  const clientSecret = env.ENTRA_CLIENT_SECRET?.trim();
  return clientId && clientSecret ? { clientId, clientSecret } : null;
}

// A GUID. Checked before it is put into a URL path, so a bad value in the database can never
// point the redirect somewhere else.
const TENANT_ID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

export function isTenantId(v: string | null | undefined): v is string {
  return typeof v === "string" && TENANT_ID.test(v);
}

const b64url = (buf: Buffer) => buf.toString("base64url");

/** PKCE (RFC 7636, S256). The verifier stays in our cookie; only the challenge goes to Microsoft. */
export function pkcePair(): { verifier: string; challenge: string } {
  const verifier = b64url(randomBytes(32));
  return { verifier, challenge: b64url(createHash("sha256").update(verifier).digest()) };
}

export const randomToken = () => b64url(randomBytes(24));

export function authorizeUrl(p: {
  tenantId: string;
  clientId: string;
  redirectUri: string;
  state: string;
  nonce: string;
  challenge: string;
}): string {
  const u = new URL(`${MICROSOFT_AUTHORITY}/${p.tenantId}/oauth2/v2.0/authorize`);
  u.search = new URLSearchParams({
    client_id: p.clientId,
    response_type: "code",
    redirect_uri: p.redirectUri,
    response_mode: "query",
    scope: "openid profile email",
    state: p.state,
    nonce: p.nonce,
    code_challenge: p.challenge,
    code_challenge_method: "S256",
    prompt: "select_account",
  }).toString();
  return u.toString();
}

export function tokenUrl(tenantId: string): string {
  return `${MICROSOFT_AUTHORITY}/${tenantId}/oauth2/v2.0/token`;
}

export function tokenRequestBody(p: {
  clientId: string;
  clientSecret: string;
  code: string;
  redirectUri: string;
  verifier: string;
}): URLSearchParams {
  return new URLSearchParams({
    client_id: p.clientId,
    client_secret: p.clientSecret,
    grant_type: "authorization_code",
    code: p.code,
    redirect_uri: p.redirectUri,
    code_verifier: p.verifier,
    scope: "openid profile email",
  });
}

// ── The flow cookie ─────────────────────────────────────────────────────────
// Carries what the callback needs to prove it is answering OUR request: state (CSRF), nonce
// (replay), the PKCE verifier, and where to go afterwards. Signed with AUTH_SECRET, httpOnly,
// gone after one use or ten minutes.

export type Flow = { slug: string; state: string; nonce: string; verifier: string; next: string; exp: number };

const hmac = (payload: string, secret: string) => b64url(createHmac("sha256", secret).update(`ms-flow:${payload}`).digest());

export function signFlow(flow: Flow, secret: string): string {
  const payload = b64url(Buffer.from(JSON.stringify(flow)));
  return `${payload}.${hmac(payload, secret)}`;
}

export function verifyFlow(raw: string | undefined, secret: string, nowSeconds = Math.floor(Date.now() / 1000)): Flow | null {
  if (!raw) return null;
  const dot = raw.indexOf(".");
  if (dot < 1) return null;
  const payload = raw.slice(0, dot);
  const given = Buffer.from(raw.slice(dot + 1));
  const want = Buffer.from(hmac(payload, secret));
  if (given.length !== want.length || !timingSafeEqual(given, want)) return null;
  try {
    const f = JSON.parse(Buffer.from(payload, "base64url").toString("utf8")) as Partial<Flow>;
    if (
      typeof f.slug !== "string" || typeof f.state !== "string" || typeof f.nonce !== "string" ||
      typeof f.verifier !== "string" || typeof f.next !== "string" || typeof f.exp !== "number"
    ) return null;
    return f.exp > nowSeconds ? (f as Flow) : null;
  } catch {
    return null;
  }
}

/** Constant-time string compare for state. */
export function sameToken(a: string, b: string): boolean {
  const x = Buffer.from(a);
  const y = Buffer.from(b);
  return x.length === y.length && timingSafeEqual(x, y);
}

// ── The ID token ────────────────────────────────────────────────────────────

/** The payload of a JWT, unverified - see the header for why that is enough here. */
export function decodeIdToken(jwt: unknown): Record<string, unknown> | null {
  if (typeof jwt !== "string") return null;
  const parts = jwt.split(".");
  if (parts.length !== 3) return null;
  try {
    const parsed: unknown = JSON.parse(Buffer.from(parts[1], "base64url").toString("utf8"));
    return typeof parsed === "object" && parsed !== null ? (parsed as Record<string, unknown>) : null;
  } catch {
    return null;
  }
}

export type MicrosoftIdentity = { oid: string; tid: string; email: string; name: string };

export type IdTokenCheck = { ok: true; who: MicrosoftIdentity } | { ok: false; reason: MicrosoftError };

/** Clock skew we tolerate between us and Microsoft. */
const SKEW_SECONDS = 300;

export function checkIdToken(
  claims: Record<string, unknown> | null,
  want: { clientId: string; tenantId: string; nonce: string },
  nowSeconds = Math.floor(Date.now() / 1000),
): IdTokenCheck {
  if (!claims) return { ok: false, reason: "token" };
  const str = (k: string) => (typeof claims[k] === "string" ? (claims[k] as string) : "");
  const tid = str("tid");

  if (str("aud") !== want.clientId) return { ok: false, reason: "token" };
  if (tid.toLowerCase() !== want.tenantId.toLowerCase()) return { ok: false, reason: "tenant" };
  if (str("iss").toLowerCase() !== `${MICROSOFT_AUTHORITY}/${want.tenantId}/v2.0`.toLowerCase()) {
    return { ok: false, reason: "tenant" };
  }
  if (!sameToken(str("nonce"), want.nonce)) return { ok: false, reason: "token" };
  const exp = typeof claims.exp === "number" ? claims.exp : 0;
  if (exp + SKEW_SECONDS < nowSeconds) return { ok: false, reason: "expired" };

  const oid = str("oid");
  // `email` is optional in Entra tokens; preferred_username is the sign-in name (usually the UPN,
  // which is the work address). Both are only used to FIND the person the first time - after
  // that the account is matched by `oid`, which Microsoft never reassigns.
  const email = (str("email") || str("preferred_username")).trim().toLowerCase();
  if (!oid) return { ok: false, reason: "token" };
  return { ok: true, who: { oid, tid, email, name: str("name") } };
}

// ── What the login page says when it went wrong ─────────────────────────────

export const MICROSOFT_ERRORS = {
  off: "Microsoft sign-in isn't set up for this company. Use your personal login code.",
  cancelled: "Microsoft sign-in was cancelled. Try again, or use your personal login code.",
  expired: "That Microsoft sign-in took too long. Please try again.",
  state: "That Microsoft sign-in didn't start here, so we stopped it. Please try again.",
  tenant: "That Microsoft account belongs to another organisation. Sign in with your work account.",
  token: "Microsoft sent back something we couldn't read. Please try again.",
  unknown: "Your Microsoft account isn't set up here yet. Ask your team leader to add you.",
  failed: "We couldn't reach Microsoft just now. Please try again in a moment.",
} as const;

export type MicrosoftError = keyof typeof MICROSOFT_ERRORS;

export function isMicrosoftError(v: unknown): v is MicrosoftError {
  return typeof v === "string" && Object.hasOwn(MICROSOFT_ERRORS, v);
}
