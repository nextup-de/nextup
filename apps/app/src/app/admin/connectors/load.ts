// What the console's connectors page reads, for one company id (the guard's). Not a "use server" module.
import { vaultKey } from "@/features/connectors/vault";
import { AI_SYSTEM, aiSettings } from "@/features/ai/settings";
import { loadAiBudget } from "@/lib/db/ai-usage";
import { getDb } from "@/lib/db/client";
import { M365, countConnections, m365SearchOn } from "@/lib/db/connections";
import { loadDirectoryStatus } from "@/lib/db/directory-run";
import { getIntegration, JIRA } from "@/lib/db/integrations";
import { microsoftEnabledFor } from "@/server/microsoft-login";
import {
  aiBlockView, directoryBlockView, jiraBlockView, m365BlockView,
  type AiBlockView, type DirectoryBlockView, type JiraBlockView, type M365BlockView,
} from "@/components/admin/connectors/views";

export type ConnectorsData = { jira: JiraBlockView; m365: M365BlockView; ai: AiBlockView; directory: DirectoryBlockView };

export async function loadConnectors(company: { companyId: string; slug: string }): Promise<ConnectorsData> {
  const { companyId, slug } = company;
  const db = getDb();
  const vault = vaultKey() !== null;
  const [jiraRow, aiRow, stage, on, connected, last, microsoft, dir, sfRow, budget] = await Promise.all([
    getIntegration(companyId, JIRA),
    getIntegration(companyId, AI_SYSTEM),
    db.company.findUnique({ where: { id: companyId }, select: { stage: true } }),
    m365SearchOn(companyId),
    countConnections(companyId),
    db.connection.aggregate({ where: { companyId, provider: M365 }, _max: { lastUsedAt: true } }),
    microsoftEnabledFor(slug),
    loadDirectoryStatus(companyId),
    getIntegration(companyId, "successfactors"),
    // Only for the list of models without a price: the page loads without it.
    loadAiBudget(companyId).catch(() => null),
  ]);
  return {
    jira: jiraBlockView(jiraRow, vault),
    m365: m365BlockView({ on, connected, lastSearchAt: last._max.lastUsedAt, microsoft, vault }),
    ai: aiBlockView(aiSettings(aiRow ? { on: aiRow.on, settings: aiRow.settings } : null, process.env, stage?.stage ?? "demo"), aiRow?.hasSecret === true, vault, budget?.unpriced ?? []),
    directory: directoryBlockView(dir, { settings: sfRow?.settings ?? null, hasSecret: sfRow?.hasSecret === true, vault }),
  };
}
