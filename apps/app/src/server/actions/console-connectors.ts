"use server";
// The console's connector actions (ITC-A1, replaces ADM-C1): Jira test, save, on/off and sync now; the
// Microsoft 365 company switch and "disconnect everyone"; the AI choice. Each calls consoleWrite()
// first and writes for the company id it returns, never for one from the form (ITC/D4). A support
// session (D8) only reads. A key or token is write-only: it goes in sealed and nothing returns it.
import { revalidatePath } from "next/cache";
import { AI_PROVIDER_CHOICES, type AiProviderChoice } from "@nextup/contracts/public";
import { adminBase } from "@/features/admin/nav";
import { auditChanges } from "@/features/audit";
import { readJiraForm, settingsFromForm } from "@/features/admin/jira-admin";
import { vaultKey } from "@/features/connectors/vault";
import { cleanBrainModel } from "@/components/admin/connectors/views";
import { parsePriceLines } from "@/features/ai/prices";
import { AI_SYSTEM, DEFAULT_REGION, type AiSettings } from "@/features/ai/settings";
import { normalizeSiteUrl, parseJiraSettings } from "@/features/integrations/jira/settings";
import type { JiraAccount, JiraCheck, JiraIssueType } from "@/features/integrations/jira/types";
import { saveAiSettings } from "@/lib/db/ai";
import { deleteAllConnections, setM365Search } from "@/lib/db/connections";
import { getDb } from "@/lib/db/client";
import { getIntegration, integrationSecrets, jiraSaveChanges, JIRA, saveIntegration, setIntegrationOn } from "@/lib/db/integrations";
import { adminActor } from "@/server/admin-session";
import { consoleActor, recordAudit } from "@/server/audit/record";
import { consoleWrite } from "@/server/console-write";
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


const connector = (id: string) => ({ kind: "connector", id });
/** The write could not be recorded in the audit trail, so it was rolled back. */
const NOT_RECORDED: ConsoleConnectorState = { ok: false, code: "invalid", detail: "audit" };

const door = consoleWrite;

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
  const actor = await consoleActor();
  const by = await who();
  try {
    await getDb().$transaction(async (tx) => {
      await saveIntegration({
        companyId, system: JIRA, settings: parsed.settings, updatedBy: by,
        ...(secretSealed !== undefined ? { secretSealed } : {}),
        ...(moved ? { account: null } : {}),
      }, tx);
      await recordAudit(companyId, { actor, action: "audit.connector.saved", target: connector("jira"), changes: jiraSaveChanges(existing, parsed.settings, secretSealed), source: "console" }, tx);
    });
  } catch (err) {
    console.warn("[console-connectors] jira save failed -", err instanceof Error ? err.message : err);
    return NOT_RECORDED;
  }
  console.info(`[console] saved Jira for ${slug}`);
  refresh();
  return { ok: true };
}

export async function setConsoleJiraOn(on: boolean): Promise<ConsoleConnectorState> {
  const d = await door();
  if (!d.ok) return d;
  const { companyId, slug } = d.c;
  const row = await getIntegration(companyId, JIRA);
  if (on && !(row && row.hasSecret && parseJiraSettings(row.settings).ok)) return { ok: false, code: "not-configured" };
  const actor = await consoleActor();
  const by = await who();
  let found = false;
  try {
    await getDb().$transaction(async (tx) => {
      found = await setIntegrationOn(companyId, JIRA, on === true, by, new Date(), tx);
      if (found) await recordAudit(companyId, { actor, action: on === true ? "audit.connector.on" : "audit.connector.off", target: connector("jira"), source: "console" }, tx);
    });
  } catch (err) {
    console.warn("[console-connectors] jira on/off failed -", err instanceof Error ? err.message : err);
    return NOT_RECORDED;
  }
  if (!found) return { ok: false, code: "not-saved" };
  console.info(`[console] switched Jira ${on ? "on" : "off"} for ${slug}`);
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
  const actor = await consoleActor();
  try {
    await getDb().$transaction(async (tx) => {
      await setM365Search(d.c.companyId, on === true, tx);
      await recordAudit(d.c.companyId, { actor, action: on === true ? "audit.connector.on" : "audit.connector.off", target: connector("m365"), source: "console" }, tx);
    });
  } catch (err) {
    console.warn("[console-connectors] m365 switch failed -", err instanceof Error ? err.message : err);
    return NOT_RECORDED;
  }
  refresh();
  return { ok: true };
}

export async function disconnectEveryoneConsole(): Promise<ConsoleConnectorState> {
  const d = await door();
  if (!d.ok) return d;
  const actor = await consoleActor();
  try {
    await getDb().$transaction(async (tx) => {
      const n = await deleteAllConnections(d.c.companyId, tx);
      await recordAudit(d.c.companyId, { actor, action: "audit.connector.disconnected", target: connector("m365"), changes: { count: { before: null, after: n } }, source: "console" }, tx);
    });
  } catch (err) {
    console.warn("[console-connectors] disconnect failed -", err instanceof Error ? err.message : err);
    return NOT_RECORDED;
  }
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
  // The model on this stack (Q8.4) takes no endpoint, model, deployment or key: whatever the form still holds from
  // another choice is dropped, so nothing saved could point outside the stack. The prices still apply.
  const local = picked === "local";
  const endpointRaw = local ? "" : text(r.endpoint, 300);
  const endpoint = endpointRaw ? normalizeSiteUrl(endpointRaw) : null;
  if (endpointRaw && !endpoint) return { ok: false, code: "invalid", detail: "endpoint" };
  const needsEndpoint = picked === "azure-openai" || picked === "openai-compatible";
  if (needsEndpoint && !endpoint) return { ok: false, code: "invalid", detail: "endpoint" };
  // The company's own prices, one model per line (features/ai/prices.ts); a line that does not read is refused by number.
  const pricesText = typeof r.prices === "string" ? r.prices : "";
  if (pricesText.length > 5000) return { ok: false, code: "invalid", detail: "prices" };
  const priced = parsePriceLines(pricesText);
  if (!priced.ok) return { ok: false, code: "invalid", detail: `prices, line ${priced.line}` };
  const prices = Object.keys(priced.prices).length ? priced.prices : undefined;
  const settings: AiSettings = {
    choice: picked,
    region: (local ? "" : text(r.region, 40)) || DEFAULT_REGION,
    model: local ? "" : text(r.model, 120),
    endpoint,
    deployment: local ? null : text(r.deployment, 120) || null,
    brainModel: local ? null : cleanBrainModel(r.brainModel),
    ...(prices ? { prices } : {}),
  };
  const key = local ? "" : text(r.key, 500);
  if (key && !vaultKey()) return { ok: false, code: "no-vault" };
  if (needsEndpoint && !key && !(await integrationSecrets(d.c.companyId, AI_SYSTEM))?.secretSealed) return { ok: false, code: "no-token" };
  const actor = await consoleActor();
  const by = await who();
  const beforeRow = await getIntegration(d.c.companyId, AI_SYSTEM);
  const beforeSettings = beforeRow && typeof beforeRow.settings === "object" && beforeRow.settings !== null ? (beforeRow.settings as Record<string, unknown>) : null;
  const savedSettings = { choice: picked, region: settings.region, model: settings.model, endpoint: settings.endpoint, deployment: settings.deployment, brainModel: settings.brainModel, prices: prices ?? null };
  const hadKey = beforeRow?.hasSecret ? "sealed" : null;
  const changes = auditChanges(
    beforeRow ? { ...beforeSettings, key: hadKey } : null,
    { ...savedSettings, key: key ? `new:${key}` : hadKey },
    ["key"],
  );
  try {
    await getDb().$transaction(async (tx) => {
      await saveAiSettings(d.c.companyId, settings, key || null, by, tx);
      await recordAudit(d.c.companyId, { actor, action: "audit.connector.saved", target: connector("ai"), changes, source: "console" }, tx);
    });
  } catch (err) {
    console.warn("[console-connectors] ai save failed -", err instanceof Error ? err.message : err);
    return NOT_RECORDED;
  }
  console.info(`[console] saved the AI choice for ${d.c.slug}`);
  refresh();
  return { ok: true };
}
