"use server";
// /admin/integrations (company stack): Jira's settings, the connection test, on/off, "Sync now" and the
// webhook secret (docs/plans/2026-10-29_jira-in-app.md). Admin only, and only this stack's own company.
// The API token goes in sealed and never comes back out: the page only learns that there is one.
import { revalidatePath } from "next/cache";
import { adminBase } from "@/features/admin/nav";
import { readJiraForm, settingsFromForm } from "@/features/admin/jira-admin";
import { vaultKey } from "@/features/connectors/vault";
import type { JiraAccount, JiraCheck, JiraIssueType } from "@/features/integrations/jira/types";
import { parseJiraSettings } from "@/features/integrations/jira/settings";
import { deleteIntegration, getIntegration, JIRA, saveIntegration, setIntegrationOn } from "@/lib/db/integrations";
import { adminActor } from "@/server/admin-session";
import { adminCompany, newWebhookSecret, sealSecret, storedToken } from "@/server/jira-admin";
import { testJira } from "@/server/jira/test";
import { kickJira } from "@/server/jira-sync";

export type JiraActionState = { ok?: boolean; error?: string };
export type JiraTestState = {
  ok: boolean;
  error?: string;
  checks: JiraCheck[];
  account: JiraAccount | null;
  issueTypes: JiraIssueType[];
};
export type JiraSecretState = JiraActionState & { secret?: string };

const NOT_ADMIN = "Not signed in to the admin area, or this is not a company stack.";
const NO_VAULT = "CONNECTOR_VAULT_KEY is missing, so the token cannot be stored.";
const refresh = () => revalidatePath(adminBase() + "/integrations");
const who = async () => (await adminActor()) ?? "admin code";

/** Run the connection test with what is in the form. A token left empty uses the saved one. */
export async function testJiraAction(raw: unknown): Promise<JiraTestState> {
  const fail = (error: string): JiraTestState => ({ ok: false, error, checks: [], account: null, issueTypes: [] });
  const company = await adminCompany();
  if (!company) return fail(NOT_ADMIN);
  const form = readJiraForm(raw);
  const parsed = settingsFromForm(form, { forTest: true });
  if (!parsed.ok) return fail(parsed.errors.join(" "));
  const token = form.token || (await storedToken(company.id));
  if (!token) return fail("Enter the API token first - none is saved.");
  try {
    const r = await testJira(parsed.settings, token);
    return { ok: r.ok, checks: r.checks, account: r.account, issueTypes: r.issueTypes };
  } catch (err) {
    // testJira reports a refused call as a failed check; this is something unexpected (a bug, a dead network).
    console.warn("[jira-admin] connection test threw -", err instanceof Error ? err.message : err);
    return fail("The test could not run. See the server log.");
  }
}

/** Save the settings, and the token when one was typed. Saving does not switch the sync on. */
export async function saveJiraAction(raw: unknown): Promise<JiraActionState> {
  const company = await adminCompany();
  if (!company) return { error: NOT_ADMIN };
  const form = readJiraForm(raw);
  const parsed = settingsFromForm(form);
  if (!parsed.ok) return { error: parsed.errors.join(" ") };
  const existing = await getIntegration(company.id, JIRA);
  let secretSealed: string | undefined;
  if (form.token) {
    const key = vaultKey();
    if (!key) return { error: NO_VAULT };
    secretSealed = sealSecret(form.token, key, company.id);
  } else if (!existing?.hasSecret) {
    return { error: "Enter the API token - none is saved yet." };
  }
  // A new site or integration account is a different "who am I": the next good round learns it again.
  const settingsMoved = existing && (() => {
    const old = parseJiraSettings(existing.settings);
    return !old.ok || old.settings.siteUrl !== parsed.settings.siteUrl || old.settings.email !== parsed.settings.email || secretSealed !== undefined;
  })();
  await saveIntegration({
    companyId: company.id, system: JIRA, settings: parsed.settings, updatedBy: await who(),
    ...(secretSealed !== undefined ? { secretSealed } : {}),
    ...(settingsMoved ? { account: null } : {}),
  });
  console.info(`[admin] ${await who()} saved the Jira settings for ${company.slug}`);
  refresh();
  return { ok: true };
}

/** Switch the sync on or off. On needs saved settings and a token; it also starts a round at once. */
export async function setJiraOnAction(on: boolean): Promise<JiraActionState> {
  const company = await adminCompany();
  if (!company) return { error: NOT_ADMIN };
  const row = await getIntegration(company.id, JIRA);
  if (on && !(row && row.hasSecret && parseJiraSettings(row.settings).ok)) return { error: "Save valid settings and a token first." };
  if (!(await setIntegrationOn(company.id, JIRA, on === true, await who()))) return { error: "Nothing is saved yet." };
  console.info(`[admin] ${await who()} switched the Jira sync ${on ? "on" : "off"} for ${company.slug}`);
  if (on) kickJira(company.slug);
  refresh();
  return { ok: true };
}

/** Start a round now instead of waiting for the minute. */
export async function syncJiraNowAction(): Promise<JiraActionState> {
  const company = await adminCompany();
  if (!company) return { error: NOT_ADMIN };
  const row = await getIntegration(company.id, JIRA);
  if (!row?.on) return { error: "Switch the sync on first." };
  kickJira(company.slug);
  refresh();
  return { ok: true };
}

/** Make (or replace) the webhook secret. It is returned once and stored sealed; Jira gets it pasted by hand. */
export async function newWebhookSecretAction(): Promise<JiraSecretState> {
  const company = await adminCompany();
  if (!company) return { error: NOT_ADMIN };
  const key = vaultKey();
  if (!key) return { error: NO_VAULT };
  const row = await getIntegration(company.id, JIRA);
  if (!row) return { error: "Save the settings first." };
  const secret = newWebhookSecret();
  await saveIntegration({
    companyId: company.id, system: JIRA, settings: row.settings, updatedBy: await who(),
    webhookSecretSealed: sealSecret(secret, key, company.id),
  });
  console.info(`[admin] ${await who()} made a new Jira webhook secret for ${company.slug}`);
  refresh();
  return { ok: true, secret };
}

/** Take the webhook off: without a secret the route accepts nothing, and the minute poll carries on. */
export async function removeWebhookSecretAction(): Promise<JiraActionState> {
  const company = await adminCompany();
  if (!company) return { error: NOT_ADMIN };
  const row = await getIntegration(company.id, JIRA);
  if (!row) return { ok: true };
  await saveIntegration({ companyId: company.id, system: JIRA, settings: row.settings, updatedBy: await who(), webhookSecretSealed: null });
  refresh();
  return { ok: true };
}

/** Forget the integration: settings, token and secret go; issues already in Jira stay as they are. */
export async function removeJiraAction(): Promise<JiraActionState> {
  const company = await adminCompany();
  if (!company) return { error: NOT_ADMIN };
  await deleteIntegration(company.id, JIRA);
  console.info(`[admin] ${await who()} removed the Jira integration for ${company.slug}`);
  refresh();
  return { ok: true };
}
