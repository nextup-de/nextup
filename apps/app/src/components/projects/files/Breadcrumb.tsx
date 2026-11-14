"use client";
import { projectFolder } from "@/features/files/link";
import { useT } from "@/i18n/client";
import type { FilesPartProps } from "./types";
import styles from "./List.module.css";

/** FilesView mounts this ahead of the toolbar; the toolbar draws the trail in its own row, so this mount draws nothing. */
export function Breadcrumb(props: FilesPartProps) {
  void props;
  return null;
}

/** The last two names of the folder link's path, e.g. "Shared Documents › Supplier data". */
export function trailOf(url: string | undefined): string[] {
  if (!url) return [];
  try {
    const parts = new URL(url).pathname.split("/").filter(Boolean).map((part) => { try { return decodeURIComponent(part); } catch { return part; } });
    return parts.slice(-2);
  } catch { return []; }
}

/** 'Shared documents › Supplier data': inside a subfolder it grows by one and every part goes back to its level. */
export function BreadcrumbTrail({ state, actions }: FilesPartProps) {
  const t = useT();
  const [parent, root] = trailOf(projectFolder(state.p)?.url);
  const inside = state.path.length > 0;
  const names = [...(inside ? [] : parent ? [parent] : []), root ?? "", ...state.path].filter(Boolean);
  // `levels[i]` is the depth a part goes back to; the context part before the project's folder is not a place to go.
  const first = inside || !parent ? 0 : -1;
  return <nav className={styles.crumbs} aria-label={t("projectFiles.breadcrumb")} data-testid="files-breadcrumb">
    {names.map((name, index) => {
      const last = index === names.length - 1;
      const depth = first + index;
      return <span key={index} className={styles.crumb}>
        {index > 0 && <span aria-hidden="true" className={styles.sep}>›</span>}
        {last ? <strong aria-current="page">{name}</strong>
          : depth < 0 ? <span className={styles.context}>{name}</span>
          : <button type="button" className={styles.crumbButton} onClick={() => actions.goTo(depth)}>{name}</button>}
      </span>;
    })}
  </nav>;
}
