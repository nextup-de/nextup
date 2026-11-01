// The work tracker a company has switched on (D4, D5): Jira when the company's Integration row for "jira" is on, its
// settings parse and its token opens (the vault, exactly as server/jira-sync.ts), otherwise null. Not configured is
// absent, not an error; never throws. NOT a "use server" module.
import type { WorkTracker } from "@nextup/contracts/public";
import { integrationContext, open, vaultKey } from "@/features/connectors/vault";
import { parseJiraSettings } from "@/features/integrations/jira/settings";
import type { JiraAccount } from "@/features/integrations/jira/types";
import { getIntegration, integrationSecrets, JIRA } from "@/lib/db/integrations";
import { jiraWorkTracker } from "@/server/connectors/jira";
import { jiraApiFor } from "@/server/jira/flavors";

const accountOf = (v: unknown): JiraAccount | null => {
  if (typeof v !== "object" || v === null) return null;
  const a = v as Record<string, unknown>;
  return typeof a.id === "string" && typeof a.name === "string" ? { id: a.id, name: a.name } : null;
};

export async function workTrackerFor(companyId: string): Promise<WorkTracker | null> {
  try {
    const row = await getIntegration(companyId, JIRA);
    if (!row || !row.on) return null;
    const parsed = parseJiraSettings(row.settings);
    if (!parsed.ok) return null;
    const key = vaultKey();
    const sealed = (await integrationSecrets(companyId, JIRA))?.secretSealed ?? null;
    const token = key && sealed ? open(sealed, key, integrationContext(companyId, JIRA)) : null;
    if (!token) return null;
    return jiraWorkTracker(jiraApiFor(parsed.settings, token), parsed.settings, accountOf(row.account));
  } catch {
    return null;
  }
}
