// Redeeming a person's stored Microsoft 365 refresh token for a Graph access token (phase 2 of
// docs/plans/2026-10-22_sso-and-data-access.md, step 2.3). Pure: the request we send and what the
// answer means. The glue that reads the Connection row and calls Microsoft is
// src/server/graph-token.ts.

/** What live search needs, and no more: the files the person can open, and a way to come back. */
export const GRAPH_SCOPE = "https://graph.microsoft.com/Files.Read.All offline_access";

export function refreshRequestBody(p: { clientId: string; clientSecret: string; refreshToken: string }): URLSearchParams {
  return new URLSearchParams({
    client_id: p.clientId,
    client_secret: p.clientSecret,
    grant_type: "refresh_token",
    refresh_token: p.refreshToken,
    scope: GRAPH_SCOPE,
  });
}

// Microsoft's answers that no retry fixes: the token was revoked or expired, the password changed,
// consent was withdrawn, or Conditional Access now wants the person in front of a screen. The
// person has to connect again.
const RENEW = new Set(["invalid_grant", "interaction_required", "consent_required", "login_required"]);

export type Redeemed =
  /** `refreshToken` is the rotated one to store, or null when Microsoft did not send a new one. */
  | { kind: "ok"; accessToken: string; refreshToken: string | null; expiresIn: number }
  /** `why` is safe to store and show an admin: the OAuth error and the first AADSTS code, no text. */
  | { kind: "renew"; why: string }
  | { kind: "failed" };

/** Reads the token endpoint's answer. Never copies a token into `why`. */
export function readRedeemed(status: number, body: unknown): Redeemed {
  const b = typeof body === "object" && body !== null ? (body as Record<string, unknown>) : {};
  const error = typeof b.error === "string" ? b.error : "";
  if (status >= 200 && status < 300 && !error) {
    if (typeof b.access_token !== "string" || !b.access_token) return { kind: "failed" };
    const expiresIn = typeof b.expires_in === "number" ? b.expires_in : Number(b.expires_in);
    return {
      kind: "ok",
      accessToken: b.access_token,
      refreshToken: typeof b.refresh_token === "string" && b.refresh_token ? b.refresh_token : null,
      expiresIn: Number.isFinite(expiresIn) && expiresIn > 0 ? expiresIn : 3600,
    };
  }
  if (!RENEW.has(error)) return { kind: "failed" };
  const code = Array.isArray(b.error_codes) && typeof b.error_codes[0] === "number" ? ` AADSTS${b.error_codes[0]}` : "";
  return { kind: "renew", why: error + code };
}
