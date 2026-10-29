// The Integration row as the screens need it (JiraStatusView). Pure: the row's facts in, plain values out.
import { parseJiraSettings } from "./settings";
import type { JiraAccount, JiraStatusView } from "./types";

/** The non-secret facts of an Integration row for system "jira" (lib/db/integrations IntegrationInfo fits). */
export type IntegrationFacts = {
  on: boolean;
  enabledAt: Date | null;
  settings: unknown;
  hasSecret: boolean;
  hasWebhookSecret: boolean;
  account: unknown;
  lastRunAt: Date | null;
  lastOkAt: Date | null;
  lastError: string | null;
};

const iso = (d: Date | null): string | null => (d ? d.toISOString() : null);

const accountOf = (v: unknown): JiraAccount | null => {
  if (typeof v !== "object" || v === null) return null;
  const a = v as Record<string, unknown>;
  return typeof a.id === "string" && typeof a.name === "string" ? { id: a.id, name: a.name } : null;
};

/** Did Jira refuse the token? The sync stores a failed call as "<http status> <reason>". */
export const isTokenError = (lastError: string | null): boolean => lastError !== null && /^(401|403)\b/.test(lastError);

/** The status for the admin page. `null` row = nothing saved yet. `linked` and `problems` are filled in by the caller. */
export function jiraStatusView(row: IntegrationFacts | null): JiraStatusView {
  if (!row) {
    return {
      configured: false, on: false, enabledAt: null, siteUrl: null, projectKey: null, hasToken: false, hasWebhookSecret: false,
      account: null, lastRunAt: null, lastOkAt: null, lastError: null, tokenExpired: false, linked: null, problems: [],
    };
  }
  const parsed = parseJiraSettings(row.settings);
  const settings = parsed.ok ? parsed.settings : null;
  return {
    configured: settings !== null && row.hasSecret,
    // On only counts when it could run: valid settings and a token.
    on: row.on && settings !== null && row.hasSecret,
    enabledAt: iso(row.enabledAt),
    siteUrl: settings?.siteUrl ?? null,
    projectKey: settings?.projectKey ?? null,
    hasToken: row.hasSecret,
    hasWebhookSecret: row.hasWebhookSecret,
    account: accountOf(row.account),
    lastRunAt: iso(row.lastRunAt),
    lastOkAt: iso(row.lastOkAt),
    lastError: row.lastError,
    tokenExpired: isTokenError(row.lastError),
    linked: null,
    problems: [],
  };
}
