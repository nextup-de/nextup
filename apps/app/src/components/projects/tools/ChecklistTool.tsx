"use client";
import type { ToolProps } from "./types";
import { contentOf, EmptyTool } from "./content";
import styles from "../CustomPageView.module.css";

type Item = { id?: string; text: string; done: boolean };
const isItem = (v: unknown): v is Item => v !== null && typeof v === "object" && "text" in v && typeof v.text === "string" && "done" in v && typeof v.done === "boolean";

export function ChecklistTool({ tool }: ToolProps) {
  const { items } = contentOf(tool.content);
  const rows = Array.isArray(items) ? items.filter(isItem) : [];
  if (!rows.length) return <EmptyTool />;
  return <div className={styles.list}>{rows.map((item, i) => (
    <label key={i} className={styles.check} data-done={item.done}>
      <input type="checkbox" checked={item.done} disabled readOnly />
      <span className={styles.checkText}>{item.text}</span>
    </label>
  ))}</div>;
}
