// Reading a project's Jira attachments for the Files tool (plan JSY D15, D23): the company's own integration account, one search per 50
// linked issues, an answer kept for 60 seconds. Reading never throws. Logs carry counts and timings only: never a file name, an issue key,
// a site or a token. The bytes of an attachment are never fetched. Not a "use server" module: nothing here checks who is asking, the action
// does that first, and so does `readAttachments` for everything that decides what may be returned (connection, sync, links).
import { integrationContext, open, vaultKey } from "@/features/connectors/vault";
import { syncMode } from "@/features/integrations/jira/map";
import { attachmentRows, linkedIssues } from "@/features/integrations/jira/attachments";
import { parseJiraSettings } from "@/features/integrations/jira/settings";
import { JiraError, type AttachmentsAnswer, type JiraApi, type JiraIssue, type JiraSettings } from "@/features/integrations/jira/types";
import type { ReducedProject } from "@/features/projects/types";
import { getIntegration, integrationSecrets, JIRA } from "@/lib/db/integrations";
import { jiraApiFor } from "./flavors";

const TTL_MS = 60_000;
const BATCH = 50;
const MAX_CACHE = 500;

/** What reading needs of the company's connection: its settings, when it was switched on, a revision that changes when it is saved, and the client. */
export type JiraConn = { settings: JiraSettings; enabledAt: Date | null; revision: string; api: JiraApi };

const cache = new Map<string, { at: number; answer: AttachmentsAnswer }>();
/** For tests: forget every cached answer. */
export const clearAttachmentCache = (): void => cache.clear();

/** The company's current Jira connection, built the way the sync builds its client; null when Jira is not configured, switched off or its token cannot be read. */
export async function jiraConnFor(companyId: string): Promise<JiraConn | null> {
  try {
    const row = await getIntegration(companyId, JIRA);
    if (!row || !row.on) return null;
    const parsed = parseJiraSettings(row.settings);
    if (!parsed.ok) return null;
    const key = vaultKey();
    const sealed = (await integrationSecrets(companyId, JIRA))?.secretSealed ?? null;
    const token = key && sealed ? open(sealed, key, integrationContext(companyId, JIRA)) : null;
    if (!token) return null;
    return { settings: parsed.settings, enabledAt: row.enabledAt, revision: row.updatedAt.toISOString(), api: jiraApiFor(parsed.settings, token) };
  } catch {
    return null;
  }
}

const chunks = <T>(list: readonly T[], size: number): T[][] => Array.from({ length: Math.ceil(list.length / size) }, (_, i) => list.slice(i * size, (i + 1) * size));
const statusOf = (e: unknown): number => (e instanceof JiraError ? e.status : 0);

/**
 * The attachments of the project's linked issues. The connection, the project's sync switch and its links are checked on every call, before the
 * cache: a disconnect, a stopped sync or a changed link cannot return rows read earlier. The cache key holds the company, the project, the site,
 * the connection's revision and the current linked issue keys.
 */
export async function readAttachments(
  company: { id: string },
  project: ReducedProject,
  conn: JiraConn | null,
  o: { now?: () => number; limit?: number } = {},
): Promise<AttachmentsAnswer> {
  try {
    if (!conn) return { state: "not-connected" };
    if (syncMode(project, conn.settings, conn.enabledAt?.getTime() ?? null) === "off") return { state: "not-connected" };
    const linked = linkedIssues(project);
    if (linked.size === 0) return { state: "not-connected" };
    const keys = [...linked.keys()].sort();
    const now = o.now ?? Date.now;
    const id = [company.id, project.id, conn.settings.siteUrl, conn.revision, keys.join(",")].join("|");
    const hit = cache.get(id);
    if (hit && now() - hit.at < TTL_MS) return hit.answer;

    const started = Date.now();
    const issues: JiraIssue[] = [];
    let failed = 0;
    let denied = 0;
    const batches = chunks(keys, BATCH);
    for (const batch of batches) {
      try {
        issues.push(...(await conn.api.search(`key in (${batch.join(",")})`)));
      } catch (e) {
        failed++;
        if (statusOf(e) === 403 || statusOf(e) === 404) denied++;
      }
    }
    console.info(`[jira] attachments: ${issues.length} issues of ${keys.length}, ${failed} of ${batches.length} reads failed, ${Date.now() - started}ms`);
    if (failed === batches.length) return { state: denied === failed ? "no-access" : "offline" };
    const { rows, more } = attachmentRows(issues, project, conn.settings, o.limit === undefined ? {} : { limit: o.limit });
    const answer: AttachmentsAnswer = rows.length === 0 && more === 0 && failed === 0 ? { state: "empty" } : { state: "ok", rows, more, partial: failed > 0 };
    if (failed === 0) {
      if (cache.size >= MAX_CACHE) cache.clear();
      cache.set(id, { at: now(), answer });
    }
    return answer;
  } catch (err) {
    console.warn("[jira] attachments read failed:", err instanceof Error ? err.name : "error");
    return { state: "offline" };
  }
}
