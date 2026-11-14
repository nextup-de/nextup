"use client";
import { safeUrl } from "@/features/projects/views";
import type { ToolProps } from "./types";
import { contentOf, EmptyTool } from "./content";
import styles from "../CustomPageView.module.css";

type Link = { url: string; title: string };
const isLink = (v: unknown): v is Link => v !== null && typeof v === "object" && "url" in v && typeof v.url === "string" && "title" in v && typeof v.title === "string";

export function LinksTool({ tool }: ToolProps) {
  const { links } = contentOf(tool.content);
  const rows = Array.isArray(links) ? links.filter(isLink) : [];
  if (!rows.length) return <EmptyTool />;
  return <ul className={styles.files}>{rows.map((link, i) => {
    const url = safeUrl(link.url);
    return <li key={i} className={styles.file}>{url
      ? <a className={styles.url} href={url} target="_blank" rel="noreferrer noopener">{link.title || url}</a>
      : <span className={styles.empty}>{link.title || link.url}</span>}</li>;
  })}</ul>;
}
