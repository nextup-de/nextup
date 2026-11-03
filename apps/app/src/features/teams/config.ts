// The Teams bot registration of this stack (TMS D6). Env only; the company's own switch is the
// Integration row with system TEAMS_SYSTEM. Pure: no I/O.

/** The Integration system name of the company's Teams switch. */
export const TEAMS_SYSTEM = "teams";

export type TeamsApp = { appId: string; password: string; tenantId: string; openIdUrl: string; tokenUrl: string };

const DEFAULT_OPENID_URL = "https://login.botframework.com/v1/.well-known/openidconfiguration";

/** The bot registration, or null when any of app id, password and tenant is missing. */
export function teamsApp(env: Record<string, string | undefined> = process.env): TeamsApp | null {
  const appId = env.TEAMS_APP_ID?.trim();
  const password = env.TEAMS_APP_PASSWORD?.trim();
  const tenantId = env.TEAMS_TENANT_ID?.trim();
  if (!appId || !password || !tenantId) return null;
  return {
    appId,
    password,
    tenantId,
    openIdUrl: env.TEAMS_OPENID_URL?.trim() || DEFAULT_OPENID_URL,
    tokenUrl: env.TEAMS_TOKEN_URL?.trim() || `https://login.microsoftonline.com/${tenantId}/oauth2/v2.0/token`,
  };
}
