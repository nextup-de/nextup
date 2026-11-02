"use server";
// The console's connector actions (ITC-A1, replaces ADM-C1): Jira test, save, on/off and sync now; the
// Microsoft 365 company switch and "disconnect everyone"; the AI choice. Each calls consoleCompany()
// first and writes for the company id it returns, never for one from the form (ITC/D4). A support
// session (D8) only reads. A key or token is write-only: it goes in sealed and nothing returns it.
import { revalidatePath } from "next/cache";
import { AI_PROVIDER_CHOICES, type AiProviderChoice } from "@nextup/contracts/public";
import { adminBase } from "@/features/admin/nav";
import { readJiraForm, settingsFromForm } from "@/features/admin/jira-admin";
import { vaultKey } from "@/features/connectors/vault";
import { AI_SYSTEM, DEFAULT_REGION, type AiSettings } from "@/features/ai/settings";
import { normalizeSiteUrl, parseJiraSettings } from "@/features/integrations/jira/settings";
import type { JiraAccount, JiraCheck, JiraIssueType } from "@/features/integrations/jira/types";
import { saveAiSettings } from "@/lib/db/ai";
import { deleteAllConnections, setM365Search } from "@/lib/db/connections";
import { getIntegration, integrationSecrets, JIRA, saveIntegration, setIntegrationOn } from "@/lib/db/integrations";
import { adminActor } from "@/server/admin-session";
import { consoleCompany } from "@/server/console-guard";
import { sealSecret, storedToken } from "@/server/jira-admin";
import { kickJira } from "@/server/jira-sync";
import { testJira } from "@/server/jira/test";

export type ConsoleConnectorCode =
  | "not-allowed" | "support-read-only" | "invalid" | "no-vault" | "no-token" | "not-saved" | "not-configured" | "switch-on-first";
export type ConsoleConnectorState = { ok: true } | { ok: false; code: ConsoleConnectorCode; detail?: string };
export type ConsoleJiraTestState = {
  ok: boolean;
  code?: ConsoleConnectorCode;
  detail?: string;
  checks: JiraCheck[];
  account: JiraAccount | null;
  issueTypes: JiraIssueType[];
};

type Door = { companyId: string; slug: string };

/** The guard, then the support rule. */
async function door(): Promise<{ ok: true; c: Door } | { ok: false; code: "not-allowed" | "support-read-only" }> {
  const c = await consoleCompany();
  if (!c) return { ok: false, code: "not-allowed" };
  if ((c.via as string) === "support") return { ok: false, code: "support-read-only" };
  return { ok: true, c };
}

const refresh = () => revalidatePath(adminBase() + "/connectors");
const who = async () => (await adminActor()) ?? "admin code";

export async function testConsoleJira(raw: unknown): Promise<ConsoleJiraTestState> {
  const fail = (code: ConsoleConnectorCode, detail?: string): ConsoleJiraTestState => ({ ok: false, code, ...(detail ? { detail } : {}), checks: [], account: null, issueTypes: [] });
  const d = await door();
  if (!d.ok) return fail(d.code);
  const form = readJiraForm(raw);
  const parsed = settingsFromForm(form, { forTest: true });
  if (!parsed.ok) return fail("invalid", parsed.errors.join(" "));
  const token = form.token || (await storedToken(d.c.companyId));
  if (!token) return fail("no-token");
  try {
    const r = await testJira(parsed.settings, token);
    return { ok: r.ok, checks: r.checks, account: r.account, issueTypes: r.issueTypes };
  } catch (err) {
    console.warn("[console-connectors] jira test threw -", err instanceof Error ? err.message : err);
    return fail("invalid", "The test could not run.");
  }
}

/** Save the settings, and the token when one was typed. Saving does not switch the sync on. */
export async function saveConsoleJira(raw: unknown): Promise<ConsoleConnectorState> {
  const d = await door();
  if (!d.ok) return d;
  const { companyId, slug } = d.c;
  const form = readJiraForm(raw);
  const parsed = settingsFromForm(form);
  if (!parsed.ok) return { ok: false, code: "invalid", detail: parsed.errors.join(" ") };
  const existing = await getIntegration(companyId, JIRA);
  let secretSealed: string | undefined;
  if (form.token) {
    const key = vaultKey();
    if (!key) return { ok: false, code: "no-vault" };
    secretSealed = sealSecret(form.token, key, companyId);
  } else if (!existing?.hasSecret) {
    return { ok: false, code: "no-token" };
  }
  const moved = existing && (() => {
    const old = parseJiraSettings(existing.settings);
    return !old.ok || old.settings.siteUrl !== parsed.settings.siteUrl || old.settings.email !== parsed.settings.email || old.settings.flavor !== parsed.settings.flavor || secretSealed !== undefined;
  })();
  await saveIntegration({
    companyId, system: JIRA, settings: parsed.settings, updatedBy: await who(),
    ...(secretSealed !== undefined ? { secretSealed } : {}),
    ...(moved ? { account: null } : {}),
  });
  console.info(`[console] ${await who()} saved the Jira settings for ${slug}`);
  refresh();
  return { ok: true };
}

export async function setConsoleJiraOn(on: boolean): Promise<ConsoleConnectorState> {
  const d = await door();
  if (!d.ok) return d;
  const { companyId, slug } = d.c;
  const row = await getIntegration(companyId, JIRA);
  if (on && !(row && row.hasSecret && parseJiraSettings(row.settings).ok)) return { ok: false, code: "not-configured" };
  if (!(await setIntegrationOn(companyId, JIRA, on === true, await who()))) return { ok: false, code: "not-saved" };
  console.info(`[console] ${await who()} switched the Jira sync ${on ? "on" : "off"} for ${slug}`);
  if (on) kickJira(slug);
  refresh();
  return { ok: true };
}

export async function syncConsoleJiraNow(): Promise<ConsoleConnectorState> {
  const d = await door();
  if (!d.ok) return d;
  const row = await getIntegration(d.c.companyId, JIRA);
  if (!row?.on) return { ok: false, code: "switch-on-first" };
  kickJira(d.c.slug);
  refresh();
  return { ok: true };
}

/** Off stops new connections; people already connected stay until "disconnect everyone". */
export async function setConsoleM365(on: boolean): Promise<ConsoleConnectorState> {
  const d = await door();
  if (!d.ok) return d;
  await setM365Search(d.c.companyId, on === true);
  console.info(`[console] ${await who()} turned Microsoft 365 search ${on ? "on" : "off"} for ${d.c.slug}`);
  refresh();
  return { ok: true };
}

export async function disconnectEveryoneConsole(): Promise<ConsoleConnectorState> {
  const d = await door();
  if (!d.ok) return d;
  const n = await deleteAllConnections(d.c.companyId);
  console.info(`[console] ${await who()} disconnected everyone from Microsoft 365 for ${d.c.slug} (${n})`);
  refresh();
  return { ok: true };
}

const text = (v: unknown, max: number): string => (typeof v === "string" ? v.trim().slice(0, max) : "");

/** The AI choice. An empty `key` keeps the saved key; a typed one replaces it. */
export async function saveConsoleAi(raw: unknown): Promise<ConsoleConnectorState> {
  const d = await door();
  if (!d.ok) return d;
  const r = typeof raw === "object" && raw !== null ? (raw as Record<string, unknown>) : {};
  if (!(AI_PROVIDER_CHOICES as readonly unknown[]).includes(r.choice)) return { ok: false, code: "invalid", detail: "choice" };
  const picked = r.choice as AiProviderChoice;
  const endpointRaw = text(r.endpoint, 300);
  const endpoint = endpointRaw ? normalizeSiteUrl(endpointRaw) : null;
  if (endpointRaw && !endpoint) return { ok: false, code: "invalid", detail: "endpoint" };
  const needsEndpoint = picked === "azure-openai" || picked === "openai-compatible";
  if (needsEndpoint && !endpoint) return { ok: false, code: "invalid", detail: "endpoint" };
  const settings: AiSettings = {
    choice: picked,
    region: text(r.region, 40) || DEFAULT_REGION,
    model: text(r.model, 120),
    endpoint,
    deployment: text(r.deployment, 120) || null,
  };
  const key = text(r.key, 500);
  if (key && !vaultKey()) return { ok: false, code: "no-vault" };
  if (needsEndpoint && !key && !(await integrationSecrets(d.c.companyId, AI_SYSTEM))?.secretSealed) return { ok: false, code: "no-token" };
  await saveAiSettings(d.c.companyId, settings, key || null, await who());
  console.info(`[console] ${await who()} saved the AI choice (${picked}) for ${d.c.slug}`);
  refresh();
  return { ok: true };
}
