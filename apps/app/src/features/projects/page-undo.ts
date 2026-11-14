// The merge dialog's rows and the browser import's events (PGB D9, D10). Pure; the components send what this plans.
import type { CustomPage } from "./sidebar";
import { LIMITS, fitsEvent } from "./pages";
import type { PageIconKey, ProjectPage, ToolKind } from "./types";

export type MergeRow = { kind: ToolKind; title: string; mark: "on" | "from" | "second" };

/** The target's tools in their order, then every tool of the page that goes; a kind the target has shows as a second one. */
export function mergeRows(into: ProjectPage, from: ProjectPage): MergeRow[] {
  const have = new Set(into.tools.map((tool) => tool.kind));
  return [
    ...into.tools.map((tool): MergeRow => ({ kind: tool.kind, title: tool.title ?? "", mark: "on" })),
    ...from.tools.map((tool): MergeRow => ({ kind: tool.kind, title: tool.title ?? "", mark: have.has(tool.kind) ? "second" : "from" })),
  ];
}

export type ImportEvent = { type: "project.page.added" | "project.tool.edited"; payload: Record<string, unknown> };
export type ImportStep = { browserId: string; events: ImportEvent[]; tooLong: boolean };

const KIND_OF = { page: "doc", checklist: "checklist", table: "table", link: "links" } as const;
const ICON_OF: Record<CustomPage["kind"], PageIconKey> = { page: "doc", checklist: "checklist", table: "table", link: "link" };

/** The id a brought-over page gets; a second try finds the same one (permPageExists). */
export const importedPageId = (projectId: string, browserId: string) => `imp-${projectId}-${browserId}`;

function contentOf(page: CustomPage): string | null {
  switch (page.kind) {
    case "page": return page.body ? JSON.stringify({ body: page.body }) : null;
    case "checklist": return page.items.length ? JSON.stringify({ items: page.items.map((i) => ({ id: i.id, text: i.text, done: i.done })) }) : null;
    case "table": return page.rows.some((row) => row.some((cell) => cell)) ? JSON.stringify({ rows: page.rows }) : null;
    case "link": return page.url.trim() ? JSON.stringify({ links: [{ id: "link-0", url: page.url.trim(), title: "" }] }) : null;
  }
}

/**
 * One step per browser page not yet brought over, in order. A page whose content does not fit the event comes over
 * without it; the content follows in one tool.edited (baseRev 0) when that fits, else the page stays (tooLong).
 */
export function importPlan(projectId: string, custom: CustomPage[], done: string[]): ImportStep[] {
  return custom.filter((page) => !done.includes(page.id)).map((page) => {
    const pageId = importedPageId(projectId, page.id);
    const toolId = `${pageId}`.length < 64 ? `${pageId}-t` : pageId.slice(0, 62) + "-t";
    const title = page.title.trim().slice(0, LIMITS.titleMax) || "Page";
    const content = contentOf(page);
    const base = { pageId, title, icon: ICON_OF[page.kind] };
    const tool = { toolId, kind: KIND_OF[page.kind], title };
    const full = { ...base, tools: [content === null ? tool : { ...tool, content }] };
    if (content === null || fitsEvent(full)) return { browserId: page.id, events: [{ type: "project.page.added" as const, payload: full }], tooLong: false };
    const edit = { toolId, content, baseRev: 0 };
    if (!fitsEvent({ ...base, tools: [tool] }) || !fitsEvent(edit)) return { browserId: page.id, events: [], tooLong: true };
    return { browserId: page.id, events: [{ type: "project.page.added" as const, payload: { ...base, tools: [tool] } }, { type: "project.tool.edited" as const, payload: edit }], tooLong: false };
  });
}
