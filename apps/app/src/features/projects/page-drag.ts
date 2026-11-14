import type { ProjectPage } from "./types";

/** The middle half merges; the outer quarters only change the page order. */
export function dropIntent(rowTop: number, rowHeight: number, y: number, sameRow: boolean, fromOverview: boolean): "before" | "into" | "after" | null {
  if (sameRow || rowHeight <= 0 || ![rowTop, rowHeight, y].every(Number.isFinite)) return null;
  const fraction = (y - rowTop) / rowHeight;
  if (fraction < 0 || fraction > 1) return null;
  if (fraction < 0.25) return "before";
  if (fraction > 0.75) return "after";
  return fromOverview ? null : "into";
}

/** Pointer and keyboard actions share the same bounds and protected Overview page. */
export function pageRowMenu(pages: readonly ProjectPage[], page: ProjectPage, { editor }: { editor: boolean }) {
  const index = pages.findIndex((entry) => entry.id === page.id);
  const editable = editor && index >= 0;
  return {
    rename: editable,
    icon: editable,
    moveUp: editable && index > 0,
    moveDown: editable && index < pages.length - 1,
    mergeInto: editable && page.id !== "overview" ? pages.filter((entry) => entry.id !== page.id) : [],
    remove: editable && page.id !== "overview" && pages.length > 1,
  };
}
