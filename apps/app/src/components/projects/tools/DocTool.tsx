"use client";
import type { ToolProps } from "./types";
import { contentOf, EmptyTool } from "./content";
import styles from "../CustomPageView.module.css";

export function DocTool({ tool }: ToolProps) {
  const { body } = contentOf(tool.content);
  return typeof body === "string" && body.trim() ? <p className={styles.body}>{body}</p> : <EmptyTool />;
}
