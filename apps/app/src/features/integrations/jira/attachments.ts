// The Jira attachments of one NextUp project as rows for the Files tool's read-only group (plan JSY D15, D23). Pure: the issues Jira
// answered, the reduced project and the settings in, plain rows out. Only issues still linked to this project give rows; an attachment
// is a row once (its id and its issue key together), newest first, cut at a limit with the count of the rest.
import type { ReducedProject } from "@/features/projects/types";
import { epicKeyOf, issueKeyOf, jiraIndex } from "./map";
import { isIssueKey } from "./settings";
import type { AttachmentRow, JiraIssue, JiraSettings } from "./types";

export const ATTACHMENT_LIMIT = 50;

/** The issue keys this project is linked to in Jira (its epic and every step's issue), and the step each belongs to (null: the epic). */
export function linkedIssues(p: ReducedProject): Map<string, string | null> {
  const out = new Map<string, string | null>();
  const epic = epicKeyOf(p);
  if (epic) out.set(epic, null);
  for (const s of p.steps) {
    if (s.dropped) continue;
    const key = issueKeyOf(p, s.id);
    if (key && !out.has(key)) out.set(key, s.id);
  }
  // A key another project claimed first is not this project's: the same rule the sync uses.
  const index = jiraIndex({ projects: [p] });
  for (const key of [...out.keys()]) if (index.get(key)?.projectId !== p.id) out.delete(key);
  return out;
}

/** A same-site link to the issue's page, under the site's own context path; "" when the site or the key is not what Jira writes. */
export function issueBrowseUrl(settings: Pick<JiraSettings, "siteUrl">, key: string): string {
  if (!isIssueKey(key)) return "";
  try {
    const site = new URL(settings.siteUrl);
    if (site.protocol !== "https:" && site.protocol !== "http:") return "";
    return `${site.origin}${site.pathname.replace(/\/+$/, "")}/browse/${encodeURIComponent(key)}`;
  } catch {
    return "";
  }
}

const time = (iso: string): number => {
  const t = Date.parse(iso);
  return Number.isFinite(t) ? t : 0;
};

export function attachmentRows(
  issues: readonly JiraIssue[],
  p: ReducedProject,
  settings: Pick<JiraSettings, "siteUrl">,
  opts: { limit?: number } = {},
): { rows: AttachmentRow[]; more: number } {
  const linked = linkedIssues(p);
  const limit = opts.limit ?? ATTACHMENT_LIMIT;
  const seen = new Set<string>();
  const all: AttachmentRow[] = [];
  for (const issue of issues) {
    if (!linked.has(issue.key)) continue;
    for (const a of issue.fields.attachment ?? []) {
      const id = `${issue.key}:${a.id}`;
      if (seen.has(id)) continue;
      seen.add(id);
      all.push({
        id: a.id, issueKey: issue.key, filename: a.filename, size: a.size, ...(a.mimeType ? { mimeType: a.mimeType } : {}), created: a.created,
        who: a.author?.displayName ?? "", stepId: linked.get(issue.key) ?? null, openUrl: issueBrowseUrl(settings, issue.key),
      });
    }
  }
  all.sort((x, y) => time(y.created) - time(x.created) || x.issueKey.localeCompare(y.issueKey) || x.id.localeCompare(y.id));
  return { rows: all.slice(0, limit), more: Math.max(0, all.length - limit) };
}
