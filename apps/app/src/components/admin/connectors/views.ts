// The view builders of the console's connectors page (ITC-A1). Pure: rows and counts in, plain props
// out. A key or token never goes through here - only "set" or "not set" (ITC/D11).
import type { AiSettings } from "@/features/ai/settings";
import { formFromSettings } from "@/features/admin/jira-admin";
import type { JiraForm } from "@/features/admin/jira-admin";
import type { DirectorySourceKind } from "@/features/directory";

export type SecretState = "set" | "not set";
export const secretState = (has: boolean): SecretState => (has ? "set" : "not set");

export type JiraRowFacts = {
  on: boolean;
  settings: unknown;
  hasSecret: boolean;
  lastRunAt: Date | null;
  lastOkAt: Date | null;
  lastError: string | null;
};

export type JiraBlockView = {
  form: Omit<JiraForm, "token">;
  token: SecretState;
  on: boolean;
  configured: boolean;
  lastRunAt: string | null;
  lastOkAt: string | null;
  lastError: string | null;
  vault: boolean;
};

export function jiraBlockView(row: JiraRowFacts | null, vault: boolean): JiraBlockView {
  const form = formFromSettings(row?.settings ?? {});
  return {
    form,
    token: secretState(row?.hasSecret === true),
    on: row?.on === true,
    configured: row !== null && row.hasSecret && form.siteUrl !== "" && form.projectKey !== "",
    lastRunAt: row?.lastRunAt?.toISOString() ?? null,
    lastOkAt: row?.lastOkAt?.toISOString() ?? null,
    lastError: row?.lastError ?? null,
    vault,
  };
}

/** Counts and times only: who is connected is never shown (BetrVG §87). */
export type M365BlockView = { on: boolean; connected: number; lastSearchAt: string | null; microsoft: boolean; vault: boolean };

export function m365BlockView(f: { on: boolean; connected: number; lastSearchAt: Date | null; microsoft: boolean; vault: boolean }): M365BlockView {
  return { on: f.on, connected: f.connected, lastSearchAt: f.lastSearchAt?.toISOString() ?? null, microsoft: f.microsoft, vault: f.vault };
}

export type AiBlockView = {
  choice: AiSettings["choice"];
  region: string;
  endpoint: string;
  model: string;
  deployment: string;
  key: SecretState;
  vault: boolean;
};

export function aiBlockView(settings: AiSettings, hasKey: boolean, vault: boolean): AiBlockView {
  return {
    choice: settings.choice, region: settings.region, endpoint: settings.endpoint ?? "", model: settings.model,
    deployment: settings.deployment ?? "", key: secretState(hasKey), vault,
  };
}

export type DirectoryBlockView = { on: boolean; source: DirectorySourceKind; lastRunAt: string | null; lastError: string | null };

export function directoryBlockView(s: { on: boolean; source: DirectorySourceKind; lastRunAt: Date | null; lastError: string | null }): DirectoryBlockView {
  return { on: s.on, source: s.source, lastRunAt: s.lastRunAt?.toISOString() ?? null, lastError: s.lastError };
}
