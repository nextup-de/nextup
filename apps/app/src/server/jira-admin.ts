// What the console's Jira connector and its nav badge share. Not a "use server" module: in one, every
// export is a public action anyone can call by id.
import { type JiraNavFacts } from "@/features/admin/nav";
import { integrationContext, open, seal, vaultKey } from "@/features/connectors/vault";
import { jiraStatusView } from "@/features/integrations/jira/view";
import { getIntegration, integrationSecrets, JIRA } from "@/lib/db/integrations";

export const sealSecret = (plain: string, key: Buffer, companyId: string): string => seal(plain, key, integrationContext(companyId, JIRA));

/** The saved API token in plain, or null when there is none or it does not open (another key). Stays on the server. */
export async function storedToken(companyId: string): Promise<string | null> {
  const key = vaultKey();
  const sealed = (await integrationSecrets(companyId, JIRA))?.secretSealed;
  return key && sealed ? open(sealed, key, integrationContext(companyId, JIRA)) : null;
}

/** The Jira facts the sidebar badge needs; null when nothing was saved or the database did not answer. */
export async function jiraNavFacts(companyId: string): Promise<JiraNavFacts | null> {
  const row = await getIntegration(companyId, JIRA);
  if (!row) return null;
  const s = jiraStatusView(row);
  return { on: s.on, failing: s.lastError !== null, tokenExpired: s.tokenExpired };
}
