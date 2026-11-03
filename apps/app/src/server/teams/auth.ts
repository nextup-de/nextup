// Inbound auth for the Teams bot (TMS D7): is this request really from the Bot Framework, for our bot?
// A Bearer JWT, RS256 only, signed by a key of the OpenID document's jwks_uri, issuer
// https://api.botframework.com, audience = our app id, exp and nbf with 5 minutes skew, and the
// token's `serviceurl` equal to the activity's serviceUrl. The tenant check is TMS-D1's.
import { decodeIdToken, idTokenKeyId, verifyIdTokenSignature, type Jwk } from "@/features/auth/entra";
import type { TeamsApp } from "@/features/teams/config";

export const BOT_ISSUER = "https://api.botframework.com";

export type BotAuthFailure = "missing" | "token" | "keys" | "signature" | "issuer" | "audience" | "expired" | "serviceurl";
export type BotAuth = { ok: true } | { ok: false; reason: BotAuthFailure };

const SKEW_SECONDS = 300;
const KEY_TTL_MS = 24 * 60 * 60 * 1000;

const keyCache = new Map<string, { keys: Jwk[]; at: number }>();

/** Forget the cached keys (tests). */
export function resetBotKeyCache(): void {
  keyCache.clear();
}

async function getJson(url: string): Promise<unknown> {
  const res = await fetch(url, { cache: "no-store", signal: AbortSignal.timeout(10_000) });
  if (!res.ok) throw new Error(`${url} ${res.status}`);
  return res.json();
}

async function botKeys(app: TeamsApp, fresh: boolean, nowMs: number): Promise<Jwk[]> {
  const hit = keyCache.get(app.openIdUrl);
  if (hit && !fresh && nowMs - hit.at < KEY_TTL_MS) return hit.keys;
  const doc = (await getJson(app.openIdUrl)) as { jwks_uri?: unknown };
  if (typeof doc.jwks_uri !== "string") throw new Error("openid document without jwks_uri");
  const body = (await getJson(doc.jwks_uri)) as { keys?: Jwk[] };
  const keys = Array.isArray(body.keys) ? body.keys : [];
  keyCache.set(app.openIdUrl, { keys, at: nowMs });
  return keys;
}

const trimSlash = (s: string) => s.replace(/\/+$/, "");

/**
 * `authorization` is the raw header. `activity` only needs its serviceUrl. A failure means: answer 401
 * and touch nothing.
 */
export async function verifyBotRequest(
  authorization: string | null | undefined,
  activity: { serviceUrl?: unknown } | null | undefined,
  app: TeamsApp,
  nowMs: number = Date.now(),
): Promise<BotAuth> {
  const m = /^Bearer\s+(\S+)$/i.exec(authorization?.trim() ?? "");
  if (!m) return { ok: false, reason: "missing" };
  const jwt = m[1];

  // RS256 only, and only with a kid: anything else (none, HS256, no kid) is refused here.
  const kid = idTokenKeyId(jwt);
  if (!kid) return { ok: false, reason: "token" };

  let keys: Jwk[];
  try {
    keys = await botKeys(app, false, nowMs);
    if (!keys.some((k) => k.kid === kid)) keys = await botKeys(app, true, nowMs); // a rollover: one refetch
  } catch {
    return { ok: false, reason: "keys" };
  }
  if (!verifyIdTokenSignature(jwt, keys)) return { ok: false, reason: "signature" };

  const claims = decodeIdToken(jwt);
  if (!claims) return { ok: false, reason: "token" };
  if (claims.iss !== BOT_ISSUER) return { ok: false, reason: "issuer" };
  if (claims.aud !== app.appId) return { ok: false, reason: "audience" };

  const now = Math.floor(nowMs / 1000);
  if (typeof claims.exp !== "number" || claims.exp + SKEW_SECONDS < now) return { ok: false, reason: "expired" };
  if (claims.nbf !== undefined && (typeof claims.nbf !== "number" || claims.nbf - SKEW_SECONDS > now)) {
    return { ok: false, reason: "expired" };
  }

  const claimed = claims.serviceurl;
  const given = activity?.serviceUrl;
  if (typeof claimed !== "string" || typeof given !== "string" || !claimed || trimSlash(claimed) !== trimSlash(given)) {
    return { ok: false, reason: "serviceurl" };
  }
  return { ok: true };
}
