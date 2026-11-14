"use client";
import { useSyncExternalStore, type ReactNode } from "react";
import { createPortal } from "react-dom";
import type { ProjectPage, ToolInstance } from "@/features/projects/types";
import { headRowId } from "./heads";

/** The page header's filter slot, once it is on the page (the server render has none, so the controls start in place). */
function useSlot(pageId: string): HTMLElement | null {
  return useSyncExternalStore(() => () => {}, () => document.getElementById(headRowId(pageId)), () => null);
}

/**
 * Where a tool's controls go (FIL D10): into the page header, under the title, when the tool is the page's first, else where they are written.
 * The tool keeps its own state: only the place of the controls changes.
 */
export function HeadSlot({ page, tool, children }: { page: ProjectPage; tool: ToolInstance; children: ReactNode }): ReactNode {
  const slot = useSlot(page.id);
  return slot && page.tools[0]?.id === tool.id ? createPortal(children, slot) : children;
}
