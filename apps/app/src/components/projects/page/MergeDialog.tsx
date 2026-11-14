"use client";
import type { ReducedProject } from "@/features/projects/types";
import { useT } from "@/i18n/client";

export type MergeDialogProps = {
  p: ReducedProject;
  fromPageId: string;
  intoPageId: string;
  open: boolean;
  onClose: () => void;
  onMerged: (intoPageId: string, movedToolIds: string[]) => void;
};

/** Confirmation and undo fill this stand-in in PGB-D1. */
export function MergeDialog({ open, onClose }: MergeDialogProps) {
  const t = useT();
  if (!open) return null;
  return <div role="dialog" aria-modal="true" aria-label={t("projectPages.mergePages")} onKeyDown={(event) => { if (event.key === "Escape") onClose(); }}>
    <h2>{t("projectPages.mergePages")}</h2>
    <button type="button" onClick={onClose}>{t("projectPages.close")}</button>
  </div>;
}
