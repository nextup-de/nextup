"use client";
import { Fragment, useState } from "react";
import type { ProjectPage, ReducedProject } from "@/features/projects/types";
import type { JiraRow } from "@/features/projects/views";
import { hasDefaultTitle } from "@/features/projects/pages";
import type { MessageKey } from "@/i18n";
import { useT } from "@/i18n/client";
import { PageHead } from "@/components/ui/elements/PageHead";
import { useRights } from "../parts";
import { headOf, headRowId } from "../tools/heads";
import { useProjectHints } from "../draft/useProjectHints";
import { CreateStepDialog } from "../steps/CreateStepDialog";
import { BrowserPagesImport } from "./BrowserPagesImport";
import { ToolSection } from "./ToolSection";
import { AddToolMenu } from "./AddToolMenu";
import styles from "./PageView.module.css";

/** The events the Files page listens for: its page header lives above it, so it asks by event. */
export const FILES_UPLOAD = "nextup:files-upload";
export const FILES_SOURCE = "nextup:files-source";

export type PageViewProps = { p: ReducedProject; page: ProjectPage; jira: JiraRow; agent: boolean };

export function PageView({ p, page, jira, agent }: PageViewProps) {
  const t = useT();
  const { addStep: editor } = useRights(p);
  const { stepHints } = useProjectHints(p);
  const [stepOpen, setStepOpen] = useState(false);
  const [addAt, setAddAt] = useState<number | null>(null);
  // Only the reserved defaults carry message keys; a team's title is always literal text.
  const title = hasDefaultTitle(page) ? t(page.title as MessageKey) : page.title;
  const onAddAt = (index: number) => { if (editor) setAddAt(index); };
  return <div className={styles.page}>
    <PageHead {...headOf(page.tools[0]?.kind, { p, jira, t, editor, title, onAddStep: () => setStepOpen(true), onFilesUpload: () => window.dispatchEvent(new CustomEvent(FILES_UPLOAD)), onFilesSource: () => window.dispatchEvent(new CustomEvent(FILES_SOURCE)) })}>
      {/* The slot a tool fills with its own controls (HeadSlot); empty, the head shows no row. Tools are added below. */}
      <div id={headRowId(page.id)} />
    </PageHead>
    {page.tools.map((tool, index) => <Fragment key={tool.id}>
      <ToolSection p={p} page={page} tool={tool} jira={jira} editor={editor} hints={stepHints} index={index} count={page.tools.length} onAddAt={onAddAt} />
      {editor && <div className={styles.insert}>
        <button type="button" onClick={() => onAddAt(index + 1)}>+ {t("projectPages.addToolHere")}</button>
      </div>}
    </Fragment>)}
    {editor && <button type="button" className={styles.end} onClick={() => onAddAt(page.tools.length)}>+ {t("projectPages.addToolToPage")}</button>}
    <BrowserPagesImport p={p} editor={editor} />
    {editor && <>
      <CreateStepDialog p={p} open={stepOpen} onClose={() => setStepOpen(false)} />
      {addAt !== null && <AddToolMenu p={p} page={page} jira={jira} agent={agent} index={addAt} onClose={() => setAddAt(null)} />}
    </>}
  </div>;
}
