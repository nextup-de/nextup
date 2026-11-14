"use client";
import type { CSSProperties } from "react";
import { useT } from "@/i18n/client";
import type { ToolProps } from "./types";
import { useToolContent } from "../hub/useToolContent";
import { ContentEditor } from "../hub/content/SaveStatus";
import styles from "../CustomPageView.module.css";

export function TableTool({ p, tool, page }: ToolProps) {
  const t = useT();
  const save = useToolContent<"table">(p, tool);
  const { rows } = save.value;
  const cols = Math.max(1, ...rows.map((row) => row.length));
  return <ContentEditor save={save}>
    <div className={styles.tableWrap}>
      {!!rows.length && <div className={styles.table} role="table" aria-label={tool.title ?? page.title} style={{ "--cols": cols } as CSSProperties}>
        {rows.map((row, ri) => <div key={ri} className={styles.tr} role="row" data-head={ri === 0}>
          {Array.from({ length: cols }, (_, ci) => <div key={ci} className={styles.td} role={ri === 0 ? "columnheader" : "cell"}>
            {save.editor ? <input className={styles.cell} value={row[ci] ?? ""} aria-label={t("projects.pgCell", { row: ri + 1, col: ci + 1 })} onChange={(event) => save.setValue({ rows: rows.map((r, i) => i === ri ? Array.from({ length: cols }, (_, c) => c === ci ? event.target.value : r[c] ?? "") : r) })} /> : <span className={styles.cellText}>{row[ci] ?? ""}</span>}
          </div>)}
        </div>)}
      </div>}
      {!rows.length && !save.editor && <p className={styles.empty}>{t("projectHub.tableEmpty")}</p>}
      {save.editor && <div className={styles.addRow}>
        <button type="button" className={styles.quiet} onClick={() => save.setValue({ rows: [...rows, Array.from({ length: cols }, () => "")] })}>+ {t("projectHub.tableAddRow")}</button>
        <button type="button" className={styles.quiet} onClick={() => save.setValue({ rows: rows.length ? rows.map((row) => [...Array.from({ length: cols }, (_, i) => row[i] ?? ""), ""]) : [["", ""]] })}>+ {t("projectHub.tableAddColumn")}</button>
      </div>}
    </div>
  </ContentEditor>;
}
