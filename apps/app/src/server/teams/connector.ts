// Outbound to the Bot Framework (TMS D8): an app token by client credentials, and the activity post.
import type { TeamsApp } from "@/features/teams/config";

export const BOT_SCOPE = "https://api.botframework.com/.default";
/** The token is renewed this long before it expires. */
const EARLY_MS = 5 * 60 * 1000;

const tokens = new Map<string, { token: string; renewAt: number }>();

/** Forget the cached app token (tests). */
export function resetAppToken(): void {
  tokens.clear();
}

/** The bot's app token, cached until 5 minutes before it expires. `now` is in ms. */
export async function appToken(app: TeamsApp, now: number = Date.now()): Promise<string> {
  const cacheKey = `${app.tokenUrl}|${app.appId}`;
  const hit = tokens.get(cacheKey);
  if (hit && now < hit.renewAt) return hit.token;
  const res = await fetch(app.tokenUrl, {
    method: "POST",
    headers: { "content-type": "application/x-www-form-urlencoded" },
    body: new URLSearchParams({
      grant_type: "client_credentials",
      client_id: app.appId,
      client_secret: app.password,
      scope: BOT_SCOPE,
    }),
    cache: "no-store",
    signal: AbortSignal.timeout(10_000),
  });
  if (!res.ok) throw new Error(`bot token endpoint ${res.status}`);
  const body = (await res.json()) as { access_token?: unknown; expires_in?: unknown };
  if (typeof body.access_token !== "string" || !body.access_token) throw new Error("bot token endpoint sent no access_token");
  const seconds = typeof body.expires_in === "number" ? body.expires_in : Number(body.expires_in) || 3600;
  tokens.set(cacheKey, { token: body.access_token, renewAt: now + seconds * 1000 - EARLY_MS });
  return body.access_token;
}

/** Post an activity into a conversation. `id` is the new activity's id, or null when the answer had none. */
export async function sendActivity(
  app: TeamsApp,
  serviceUrl: string,
  conversationId: string,
  activity: unknown,
  now: number = Date.now(),
): Promise<{ status: number; id: string | null }> {
  const token = await appToken(app, now);
  const res = await fetch(`${serviceUrl.replace(/\/+$/, "")}/v3/conversations/${encodeURIComponent(conversationId)}/activities`, {
    method: "POST",
    headers: { "content-type": "application/json", authorization: `Bearer ${token}` },
    body: JSON.stringify(activity),
    cache: "no-store",
    signal: AbortSignal.timeout(10_000),
  });
  let id: string | null = null;
  if (res.ok) {
    try {
      const body = (await res.json()) as { id?: unknown };
      id = typeof body.id === "string" && body.id ? body.id : null;
    } catch {
      id = null;
    }
  }
  return { status: res.status, id };
}

/** 429 and 5xx are worth another try; 401, 403, 404 and every other 4xx are not. */
export function retryableStatus(status: number): boolean {
  return status === 429 || status >= 500;
}
