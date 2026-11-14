"use client";
import { useT } from "@/i18n/client";
import type { ToolProps } from "./types";
import { useToolContent } from "../hub/useToolContent";
import { ContentEditor } from "../hub/content/SaveStatus";
import styles from "../CustomPageView.module.css";

export function DocTool({ p, tool }: ToolProps) {
  const t = useT();
  const save = useToolContent<"doc">(p, tool);
  return <ContentEditor save={save}>
    <h2 className={styles.title}>{tool.title || t("projectHub.docUntitled")}</h2>
    {save.editor
      ? <textarea className={styles.notes} aria-label={t("projectHub.docBody")} placeholder={t("projects.pgNotes")} value={save.value.body} onChange={(event) => save.setValue({ body: event.target.value })} />
      : <p className={save.value.body.trim() ? styles.body : styles.empty}>{save.value.body || t("projects.pgEmpty")}</p>}
  </ContentEditor>;
}
