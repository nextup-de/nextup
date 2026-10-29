// What /admin/integrations reads and what its actions share. Not a "use server" module: in one, every
// export is a public action anyone can call by id.
import { randomBytes } from "node:crypto";
import { adminScope, type JiraNavFacts } from "@/features/admin/nav";
import { formFromSettings, jiraLinkSummary, jiraWebhookUrl, type JiraForm } from "@/features/admin/jira-admin";
import { emptyLog } from "@/features/cases/events";
import { reduce } from "@/features/cases/reducer";
import { integrationContext, open, seal, vaultKey } from "@/features/connectors/vault";
import { jiraStatusView } from "@/features/integrations/jira/view";
import type { JiraStatusView } from "@/features/integrations/jira/types";
import { appOrigin } from "@/features/tenant/urls";
import { getDb, hasDatabase } from "@/lib/db/client";
import { companySeed } from "@/lib/db/companies";
import { loadLogForSlug } from "@/lib/db/events";
import { getIntegration, integrationSecrets, JIRA } from "@/lib/db/integrations";
import { isAdmin } from "@/server/actions/admin";

/** The stack's own company, for a signed-in admin - the only one this page may change. Null for anyone else. */
export async function adminCompany(): Promise<{ id: string; slug: string } | null> {
  if (!(await isAdmin()) || !hasDatabase() || adminScope() !== "company") return null;
  const slug = process.env.COMPANY_SLUG?.trim();
  return slug ? getDb().company.findUnique({ where: { slug }, select: { id: true, slug: true } }) : null;
}

/** A webhook secret Jira is told to sign with: 32 random bytes, shown once. */
export const newWebhookSecret = (): string => randomBytes(32).toString("base64url");

export const sealSecret = (plain: string, key: Buffer, companyId: string): string => seal(plain, key, integrationContext(companyId, JIRA));

/** The saved API token in plain, or null when there is none or it does not open (another key). Stays on the server. */
export async function storedToken(companyId: string): Promise<string | null> {
  const key = vaultKey();
  const sealed = (await integrationSecrets(companyId, JIRA))?.secretSealed;
  return key && sealed ? open(sealed, key, integrationContext(companyId, JIRA)) : null;
}

export type JiraAdminView = {
  status: JiraStatusView;
  /** The saved settings as the form's starting values; the token is never in here. */
  form: Omit<JiraForm, "token">;
  webhookUrl: string;
  /** When the settings and token were last saved (they are saved together), or null. */
  savedAt: string | null;
  /** CONNECTOR_VAULT_KEY is set: without it nothing can be saved. */
  vault: boolean;
  /** For "checked 3 min ago" - the server's clock, so the page and the browser agree. */
  now: string;
};

export async function jiraAdminView(company: { id: string; slug: string }): Promise<JiraAdminView> {
  const row = await getIntegration(company.id, JIRA);
  const status = jiraStatusView(row);
  const form = formFromSettings(row?.settings ?? {});
  const fresh = new Date();
  if (row) {
    // The log is only read once there is a Jira row: until then "linked" is simply nothing.
    try {
      const rec = await getDb().company.findUnique({ where: { id: company.id }, select: { id: true, seedJson: true } });
      if (rec) {
        const log = (await loadLogForSlug(company.slug)) ?? emptyLog();
        const { linked, problems } = jiraLinkSummary(reduce(await companySeed(rec), log).projects);
        status.linked = linked;
        status.problems = problems;
      }
    } catch (err) {
      console.warn("[jira-admin] could not read the project log -", err instanceof Error ? err.message : err);
    }
  }
  return { status, form, savedAt: row ? row.updatedAt.toISOString() : null, webhookUrl: jiraWebhookUrl(appOrigin(), company.slug), vault: vaultKey() !== null, now: fresh.toISOString() };
}

/** The Jira facts the sidebar badge needs; null when nothing was saved or the database did not answer. */
export async function jiraNavFacts(companyId: string): Promise<JiraNavFacts | null> {
  const row = await getIntegration(companyId, JIRA);
  if (!row) return null;
  const s = jiraStatusView(row);
  return { on: s.on, failing: s.lastError !== null, tokenExpired: s.tokenExpired };
}
