"use client";
import type { ReducedProject, ToolKind } from "@/features/projects/types";
import { useT } from "@/i18n/client";

export type AddPageDialogProps = {
  p: ReducedProject;
  open: boolean;
  onClose: () => void;
  onCreated: (pageId: string) => void;
  preselect?: { kind: ToolKind; toolId?: string };
};

/** The two-step wizard fills this stand-in in PGB-C1. */
export function AddPageDialog({ open, onClose }: AddPageDialogProps) {
  const t = useT();
  if (!open) return null;
  return <div role="dialog" aria-modal="true" aria-label={t("projectPages.newPage")} onKeyDown={(event) => { if (event.key === "Escape") onClose(); }}>
    <h2>{t("projectPages.newPage")}</h2>
    <button type="button" onClick={onClose}>{t("projectPages.close")}</button>
  </div>;
}
