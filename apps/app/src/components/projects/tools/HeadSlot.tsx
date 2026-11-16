"use client";
import { useSyncExternalStore, type ReactNode } from "react";
import { createPortal } from "react-dom";
import type { ProjectPage, ToolInstance } from "@/features/projects/types";
import { headActionsId, headRowId } from "./heads";

/** The page header's filter slot, once it is on the page (the server render has none, so the controls start in place). */
function useSlot(id: string): HTMLElement | null {
  return useSyncExternalStore(() => () => {}, () => document.getElementById(id), () => null);
}

/**
 * Where a tool's controls go (FIL D10): into the page header, under the title, when the tool is the page's first, else where they are written.
 * The tool keeps its own state: only the place of the controls changes.
 */
export function HeadSlot({ page, tool, children, place = "row" }: { page: ProjectPage; tool: ToolInstance; children: ReactNode; place?: "row" | "actions" }): ReactNode {
  const slot = useSlot(place === "actions" ? headActionsId(page.id) : headRowId(page.id));
  return slot && page.tools[0]?.id === tool.id ? createPortal(children, slot) : children;
}
