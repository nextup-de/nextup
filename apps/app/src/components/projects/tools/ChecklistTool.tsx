"use client";
import { useState } from "react";
import { useT } from "@/i18n/client";
import type { ToolProps } from "./types";
import { useToolContent } from "../hub/useToolContent";
import { ContentEditor } from "../hub/content/SaveStatus";
import styles from "../CustomPageView.module.css";

export function ChecklistTool({ p, tool }: ToolProps) {
  const t = useT();
  const save = useToolContent<"checklist">(p, tool);
  const [draft, setDraft] = useState("");
  const { items } = save.value;
  return <ContentEditor save={save}>
    <div className={styles.list}>
      {items.map((item) => <label key={item.id} className={styles.check} data-done={item.done}>
        <input type="checkbox" checked={item.done} disabled={!save.editor} onChange={() => save.setValue({ items: items.map((x) => x.id === item.id ? { ...x, done: !x.done } : x) })} />
        <span className={styles.checkText}>{item.text}</span>
        {save.editor && <button type="button" className="nh-btn nh-btn-ghost nh-btn-sm" aria-label={t("projectHub.checklistRemoveItem", { item: item.text })} onClick={(event) => { event.preventDefault(); save.setValue({ items: items.filter((x) => x.id !== item.id) }); }}>×</button>}
      </label>)}
      {!items.length && !save.editor && <p className={styles.empty}>{t("projectHub.checklistEmpty")}</p>}
      {save.editor && <form className={styles.addRow} onSubmit={(event) => {
        event.preventDefault();
        if (!draft.trim()) return;
        save.setValue({ items: [...items, { id: crypto.randomUUID(), text: draft.trim(), done: false }] });
        setDraft("");
      }}>
        <input className={styles.input} value={draft} onChange={(event) => setDraft(event.target.value)} placeholder={t("projectHub.checklistItemLabel")} aria-label={t("projectHub.checklistItemLabel")} />
        <button type="submit" className="nh-btn nh-btn-ghost nh-btn-sm" disabled={!draft.trim()}>{t("projectHub.checklistAddItem")}</button>
      </form>}
    </div>
  </ContentEditor>;
}
