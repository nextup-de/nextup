"use client";
import type { CSSProperties } from "react";
import type { ToolProps } from "./types";
import { contentOf, EmptyTool } from "./content";
import styles from "../CustomPageView.module.css";

export function TableTool({ tool, page }: ToolProps) {
  const { rows } = contentOf(tool.content);
  const table = Array.isArray(rows) ? rows.filter((row): row is string[] => Array.isArray(row) && row.every((cell) => typeof cell === "string")) : [];
  if (!table.length || !table.some((row) => row.length)) return <EmptyTool />;
  const cols = Math.max(...table.map((row) => row.length));
  return <div className={styles.tableWrap}>
    <div className={styles.table} role="table" aria-label={tool.title ?? page.title} style={{ "--cols": cols } as CSSProperties}>
      {table.map((row, ri) => <div key={ri} className={styles.tr} role="row" data-head={ri === 0}>
        {Array.from({ length: cols }, (_, ci) => <div key={ci} className={styles.td} role={ri === 0 ? "columnheader" : "cell"}>
          <span className={styles.cellText}>{row[ci] ?? ""}</span>
        </div>)}
      </div>)}
    </div>
  </div>;
}
