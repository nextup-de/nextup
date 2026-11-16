// What the page header (PageHead, FIL D10) shows for a page, from the page's first tool: the source pill, 'Open in … ↗' and the one primary button.
// A tool with no entry gives the title only. The page's own title is the h1; an entry's `title` is only the fallback.
import type { PageHeadProps } from "@/components/ui/elements/PageHead";
import type { ReducedProject, ToolKind } from "@/features/projects/types";
import type { JiraRow } from "@/features/projects/views";
import type { MessageKey } from "@/i18n";
import { filesHead } from "../files/head";

/** The node in the page header where the first tool puts its filter row. */
export const headRowId = (pageId: string): string => "head-row-" + pageId;
/** The node right of the page header's buttons where the first tool puts its own controls (the Overview's range and Share). */
export const headActionsId = (pageId: string): string => "head-actions-" + pageId;

type T = (key: MessageKey, params?: Record<string, string | number>) => string;

/** What a head may use: the project, the company's Jira row, words, the rights, and the page's handlers. */
export type HeadProps = {
  p: ReducedProject;
  jira: JiraRow;
  t: T;
  /** Who may add a step: the primary buttons that change things are hidden for everyone else. */
  editor: boolean;
  /** The page's own title. */
  title: string;
  onAddStep: () => void;
  /** The Files page: its list reads these as window events (a part of the Files page, not of the page header). */
  onFilesUpload: () => void;
  onFilesSource: () => void;
  /** "3 min ago": when the Files list last read its folder (the pill's 'Synced … ago'). */
  filesSyncedAgo?: string;
};

/** The Jira pill and 'Open in Jira ↗' of a step tool: only while the project's JiraRow is synced (D10). */
function jiraHead({ jira, t, title, editor, onAddStep }: HeadProps): PageHeadProps {
  const synced = jira.state === "synced";
  return {
    title,
    ...(synced ? {
      source: { system: "jira", label: t("projectPages.tagJira"), ...(jira.projectKey ? { key: jira.projectKey } : {}), ...(jira.chip ? { syncedAt: jira.chip.text } : {}), state: jira.chip?.tone === "problem" ? "problem" as const : jira.chip?.tone === "sending" ? "syncing" as const : "ok" as const },
      ...(jira.siteUrl ? { open: { label: t("projectPages.openInJira"), href: jira.projectKey ? `${jira.siteUrl.replace(/\/$/, "")}/browse/${encodeURIComponent(jira.projectKey)}` : jira.siteUrl } } : {}),
    } : {}),
    ...(editor ? { primary: { label: t("projectPages.addStep"), icon: "+", onClick: onAddStep } } : {}),
  };
}

export const TOOL_HEADS: Partial<Record<ToolKind, (c: HeadProps) => PageHeadProps>> = {
  idea: ({ title }) => ({ title }),
  // Paper "Jira pages · new header": the Overview carries the Jira pill too, but no Add step.
  overview: (c) => { const { open: _open, ...head } = jiraHead({ ...c, editor: false }); void _open; return head; },
  // Paper "Jira pages · new header": Results carries the Jira pill and Open in Jira; it has no Add step.
  results: (c) => jiraHead({ ...c, editor: false }),
  requests: (c) => jiraHead({ ...c, editor: false }),
  board: jiraHead,
  list: jiraHead,
  calendar: jiraHead,
  timeline: jiraHead,
  milestones: jiraHead,
  files: ({ p, t, title, editor, onFilesUpload, onFilesSource, filesSyncedAgo }) => ({ ...filesHead(p, t, { onUpload: onFilesUpload, canUpload: editor, onOpenSource: onFilesSource, ...(filesSyncedAgo ? { syncedAgo: filesSyncedAgo } : {}) }), title }),
};

/** The head of a page: its first tool's entry, or the title only. */
export function headOf(kind: ToolKind | undefined, c: HeadProps): PageHeadProps {
  const entry = kind ? TOOL_HEADS[kind] : undefined;
  return entry ? entry(c) : { title: c.title };
}
