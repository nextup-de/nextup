// A Microsoft Graph access token for one person, from their sealed refresh token (phase 2 of
// docs/plans/2026-10-22_sso-and-data-access.md, step 2.3). The rotated refresh token is sealed
// and stored again; Microsoft refusing it for good (revoked, password changed, Conditional Access)
// marks the connection so the profile says "connect again". Never throws.
//
// Access tokens live in this process's memory only, until a few minutes before they expire, so a
// conversation does not redeem the refresh token on every question. The Connection row is read
// every time all the same, so a disconnect (or "disconnect everyone") stops searches at once.
// Tokens are never logged.
//
// NOT a "use server" module: nothing here checks who is asking. Callers pass the viewer.
import { entraApp, isTenantId, tokenUrl } from "@/features/auth/entra";
import { open, seal, vaultContext, vaultKey } from "@/features/connectors/vault";
import { readRedeemed, refreshRequestBody } from "@/features/m365/token";
import { getDb } from "@/lib/db/client";
import { connectionRefused, connectionUsed, sealedRefreshToken } from "@/lib/db/connections";

const EARLY_MS = 5 * 60_000;
const cache = new Map<string, { token: string; until: number }>();
const pending = new Map<string, Promise<string | null>>();

/** The access token, or null: not connected, connect again, or Microsoft did not answer. */
export async function graphAccessToken(companyId: string, userId: string): Promise<string | null> {
  const key = `${companyId}:${userId}`;
  try {
    const sealed = await sealedRefreshToken(companyId, userId);
    if (!sealed) {
      cache.delete(key);
      return null;
    }
    const hit = cache.get(key);
    if (hit && hit.until > Date.now()) return hit.token;
    let p = pending.get(key);
    if (!p) {
      p = redeem(companyId, userId, sealed).finally(() => pending.delete(key));
      pending.set(key, p);
    }
    return await p;
  } catch (err) {
    console.warn("[m365] connection read failed:", err instanceof Error ? err.name : "error");
    return null;
  }
}

async function redeem(companyId: string, userId: string, sealed: string): Promise<string | null> {
  const key = `${companyId}:${userId}`;
  try {
    const app = entraApp();
    const vault = vaultKey();
    if (!app || !vault) return null;
    const company = await getDb().company.findUnique({ where: { id: companyId }, select: { entraTenantId: true } });
    if (!isTenantId(company?.entraTenantId)) return null;

    const context = vaultContext(companyId, userId);
    const refreshToken = open(sealed, vault, context);
    if (!refreshToken) {
      // Sealed with another key (CONNECTOR_VAULT_KEY changed) or for another row: unusable.
      await connectionRefused(companyId, userId, "vault");
      return null;
    }

    const res = await fetch(tokenUrl(company.entraTenantId), {
      method: "POST",
      headers: { "content-type": "application/x-www-form-urlencoded" },
      body: refreshRequestBody({ clientId: app.clientId, clientSecret: app.clientSecret, refreshToken }),
      cache: "no-store",
      signal: AbortSignal.timeout(5_000),
    });
    const r = readRedeemed(res.status, await res.json().catch(() => null));
    if (r.kind === "renew") {
      console.warn(`[m365] token refused (${r.why}); the person has to connect again`);
      await connectionRefused(companyId, userId, r.why);
      cache.delete(key);
      return null;
    }
    if (r.kind === "failed") {
      console.warn(`[m365] token endpoint answered ${res.status}`);
      return null;
    }
    await connectionUsed(companyId, userId, r.refreshToken ? seal(r.refreshToken, vault, context) : null);
    cache.set(key, { token: r.accessToken, until: Date.now() + r.expiresIn * 1000 - EARLY_MS });
    return r.accessToken;
  } catch (err) {
    console.warn("[m365] token refresh failed:", err instanceof Error ? err.name : "error");
    return null;
  }
}
