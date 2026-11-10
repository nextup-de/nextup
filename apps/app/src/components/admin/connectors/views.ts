// The view builders of the console's connectors page (ITC-A1). Pure: rows and counts in, plain props
// out. A key or token never goes through here - only "set" or "not set" (ITC/D11).
import { priceLines } from "@/features/ai/prices";
import type { AiSettings } from "@/features/ai/settings";
import { formFromSettings } from "@/features/admin/jira-admin";
import type { JiraForm } from "@/features/admin/jira-admin";
import type { DirectoryCounts, DirectorySourceKind } from "@/features/directory";
import { isTokenError } from "@/features/integrations/jira/view";

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
  /** The last round failed because Jira refused the token (401/403): expired or revoked (PILOT_CHECK G8). */
  tokenRefused: boolean;
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
    tokenRefused: isTokenError(row?.lastError ?? null),
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
  /** The brain's model; empty means the assistant's model (plan AIB D8). */
  brainModel: string;
  /** The company's own prices as the form's text, one model per line (features/ai/prices.ts). */
  prices: string;
  /** Models called this month that have neither a company price nor a list price: the names to price. */
  unpriced: string[];
  key: SecretState;
  vault: boolean;
};

export const BRAIN_MODEL_MAX = 120;

/** A typed brain model: trimmed, at most 120 characters, empty is null (so the assistant's model applies). */
export function cleanBrainModel(v: unknown): string | null {
  return typeof v === "string" ? v.trim().slice(0, BRAIN_MODEL_MAX).trim() || null : null;
}

export function aiBlockView(settings: AiSettings, hasKey: boolean, vault: boolean, unpriced: readonly string[] = []): AiBlockView {
  return {
    choice: settings.choice, region: settings.region, endpoint: settings.endpoint ?? "", model: settings.model,
    deployment: settings.deployment ?? "", brainModel: settings.brainModel ?? "", prices: priceLines(settings.prices),
    unpriced: [...unpriced], key: secretState(hasKey), vault,
  };
}

/** The non-secret half of the SuccessFactors credentials (D7); the private key is only "set" or "not set". */
export type SuccessFactorsFormView = { apiHost: string; companyId: string; clientId: string; apiUserId: string };

/** Counts and times only: never a personnel number, never the key (SFX/D3, D7). */
export type DirectoryBlockView = {
  on: boolean;
  source: DirectorySourceKind;
  lastRunAt: string | null;
  lastOkAt: string | null;
  lastError: string | null;
  counts: DirectoryCounts;
  /** The credentials form is offered for SuccessFactors only. */
  credentials: boolean;
  successFactors: SuccessFactorsFormView;
  key: SecretState;
  vault: boolean;
};

const field = (o: Record<string, unknown>, k: string): string => (typeof o[k] === "string" ? (o[k] as string) : "");

export function directoryBlockView(
  s: { on: boolean; source: DirectorySourceKind; lastRunAt: Date | null; lastOkAt?: Date | null; lastError: string | null; counts?: DirectoryCounts },
  sf: { settings: unknown; hasSecret: boolean; vault: boolean } | null = null,
): DirectoryBlockView {
  const o = sf && typeof sf.settings === "object" && sf.settings !== null ? (sf.settings as Record<string, unknown>) : {};
  return {
    on: s.on,
    source: s.source,
    lastRunAt: s.lastRunAt?.toISOString() ?? null,
    lastOkAt: s.lastOkAt?.toISOString() ?? null,
    lastError: s.lastError,
    counts: s.counts ?? { added: 0, updated: 0, deactivated: 0, handed: 0 },
    credentials: s.source === "successfactors",
    successFactors: { apiHost: field(o, "apiHost"), companyId: field(o, "companyId"), clientId: field(o, "clientId"), apiUserId: field(o, "apiUserId") },
    key: secretState(sf?.hasSecret === true),
    vault: sf?.vault === true,
  };
}
