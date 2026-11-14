"use client";
import { useT } from "@/i18n/client";
import styles from "../CustomPageView.module.css";

/** Content is stored as JSON, including on pages imported from the browser preview. */
export function contentOf(content: string | null): Record<string, unknown> {
  try {
    const value: unknown = JSON.parse(content ?? "null");
    return value !== null && typeof value === "object" && !Array.isArray(value) ? value as Record<string, unknown> : {};
  } catch {
    return {};
  }
}

export function EmptyTool() {
  const t = useT();
  return <p className={styles.empty}>{t("projects.pgEmpty")}</p>;
}

export function ToolComing() {
  const t = useT();
  return <p className={styles.empty}>{t("projectPages.toolComing")}</p>;
}
