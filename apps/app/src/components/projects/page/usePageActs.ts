"use client";
import { useDemo } from "@/components/dashboard/DemoProvider";
import type { PageChange, PageInput, ToolChange } from "@/components/dashboard/demo/project-acts";
import { newId, type EventPayload } from "@/features/cases/events";
import type { ReducedProject, ToolKind } from "@/features/projects/types";
import { useRights } from "../parts";

export type PageActOutcome = { ok: true } | { ok: false; error: string };

/** Like useSend, but returns the refusal to the control that sent the change. */
export function usePageActs(p: ReducedProject) {
  const { act } = useDemo();
  const { check } = useRights(p);
  const page = act.project.page;
  const send = async (type: string, payload: EventPayload, go: () => unknown): Promise<PageActOutcome> => {
    const verdict = check(type, payload);
    if (!verdict.ok) return { ok: false, error: verdict.error };
    await go();
    return { ok: true };
  };
  // The act layer mints the persisted ids. Fresh probe ids let the same rights rules check additions.
  // Optional callbacks give callers those persisted ids without changing the outcome contract.
  return {
    add: (input: PageInput, onCreated?: (pageId: string) => void) => send("project.page.added", {
      ...input, pageId: newId("page"), tools: input.tools.map((tool) => ({ ...tool, toolId: newId("tool") })),
    }, () => { const id = page.add(p.id, input); onCreated?.(id); }),
    edit: (pageId: string, change: PageChange) => send("project.page.edited", { pageId, ...change }, () => page.edit(p.id, pageId, change)),
    move: (pageId: string, before: string | null) => send("project.page.moved", { pageId, before }, () => page.move(p.id, pageId, before)),
    remove: (pageId: string) => send("project.page.removed", { pageId }, () => page.remove(p.id, pageId)),
    restore: (pageId: string) => send("project.page.restored", { pageId }, () => page.restore(p.id, pageId)),
    addTool: (pageId: string, kind: ToolKind, before?: string | null, onCreated?: (toolId: string) => void) => send("project.tool.added", {
      pageId, toolId: newId("tool"), kind, ...(before !== undefined ? { before } : {}),
    }, () => { const id = page.addTool(p.id, pageId, kind, before); onCreated?.(id); }),
    moveTool: (toolId: string, toPageId: string, before?: string | null) => send("project.tool.moved", {
      toolId, toPageId, ...(before !== undefined ? { before } : {}),
    }, () => page.moveTool(p.id, toolId, toPageId, before)),
    editTool: (toolId: string, change: ToolChange) => send("project.tool.edited", { toolId, ...change }, () => page.editTool(p.id, toolId, change)),
    removeTool: (toolId: string) => send("project.tool.removed", { toolId }, () => page.removeTool(p.id, toolId)),
    restoreTool: (toolId: string) => send("project.tool.restored", { toolId }, () => page.restoreTool(p.id, toolId)),
    merge: (fromPageId: string, intoPageId: string, onMerged?: (mergeId: string) => void) => send("project.page.merged", {
      mergeId: newId("merge"), fromPageId, intoPageId,
    }, () => { const id = page.merge(p.id, fromPageId, intoPageId); onMerged?.(id); }),
    unmerge: (mergeId: string) => send("project.page.unmerged", { mergeId }, () => page.unmerge(p.id, mergeId)),
  };
}
