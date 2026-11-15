// A project starts with its Idea and Files. A story that works on Steps, Results or the Agent writes the page into the log
// first, the same fact Add page -> Ready-made pages writes, so the page has its usual id (?page=steps, ?tab=results).
import { ADDABLE_PAGES } from "../../../src/features/projects/pages";

/** The `project.page.added` payload of a ready-made page ("steps", "results", "agent", "project-overview", ...). */
export function readyPage(projectId: string, pageId: string): Record<string, unknown> {
  const page = ADDABLE_PAGES.find((entry) => entry.id === pageId);
  if (!page) throw new Error("No ready-made page " + pageId);
  const toolId = (kind: string) => `${projectId}-${pageId}-${kind}`.replace(/[^A-Za-z0-9_-]/g, "-").slice(-64);
  return { pageId: page.id, title: page.title, icon: page.icon, tools: page.tools.map((tool) => ({ kind: tool.kind, toolId: toolId(tool.kind) })) };
}
