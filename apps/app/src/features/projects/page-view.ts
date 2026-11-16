// What a tool section's ⋯ menu and the add-tool menu offer (plan PGB, D4, D6, D8). Pure: pages, tool and rights in, plain items out.
// `changing` items write an event; a viewer who may not add a step is offered none of them (D6).
import { isJiraTool, SINGLE_KINDS, TOOL_KINDS } from "./pages";
import type { ProjectPage, ReducedProject, ToolInstance, ToolKind } from "./types";

export type ToolMenuItemId = "collapse" | "expand" | "moveUp" | "moveDown" | "rename" | "openJira" | "moveToPage" | "remove";
export type MenuItem = { id: ToolMenuItemId; changing: boolean };

export function toolMenuItems(page: ProjectPage, tool: ToolInstance, { editor, jiraSyncing }: { editor: boolean; jiraSyncing: boolean }): MenuItem[] {
  const at = page.tools.findIndex((x) => x.id === tool.id);
  if (at < 0) return [];
  const items: MenuItem[] = [];
  if (editor) {
    items.push({ id: tool.collapsed ? "expand" : "collapse", changing: true });
    if (at > 0) items.push({ id: "moveUp", changing: true });
    if (at < page.tools.length - 1) items.push({ id: "moveDown", changing: true });
    items.push({ id: "rename", changing: true });
  }
  if (isJiraTool(tool.kind) && jiraSyncing) items.push({ id: "openJira", changing: false });
  if (editor) items.push({ id: "moveToPage", changing: true }, { id: "remove", changing: true });
  return items;
}

export type AddToolOption = { kind: ToolKind; tag: "jira" | "nextup" | null; taken: boolean };

/**
 * Every kind the viewer may add, in the registry's order. A kind may be added again (a second doc); a single kind the project
 * already has (overview, agent) is `taken` and shown greyed. Agent is left out for who may not see it (D6).
 * `label` turns a kind into the words the search matches; without it the kind's own name is matched.
 */
export function addToolOptions(
  pages: readonly ProjectPage[],
  _page: ProjectPage,
  { query, jiraOn, agent, label }: { query: string; jiraOn: boolean; agent: boolean; label?: (kind: ToolKind) => string },
): AddToolOption[] {
  const needle = query.trim().toLowerCase();
  return TOOL_KINDS
    .filter((kind) => agent || kind !== "agent")
    .filter((kind) => !needle || kind.includes(needle) || (label?.(kind) ?? "").toLowerCase().includes(needle))
    .map((kind) => ({
      kind,
      tag: jiraOn ? (isJiraTool(kind) ? "jira" as const : "nextup" as const) : null,
      taken: SINGLE_KINDS.includes(kind) && pages.some((p) => p.tools.some((tool) => tool.kind === kind)),
    }));
}

/** The count line of a tool head, as a number the view words; null when the kind has none. */
export function toolCount(p: Pick<ReducedProject, "steps" | "links">, kind: ToolKind): number | null {
  const steps = p.steps.filter((s) => !s.dropped);
  switch (kind) {
    case "board": case "list": return steps.length;
    case "calendar": case "timeline": return steps.filter((s) => s.dueDay !== null).length;
    case "links": return p.links.length;
    default: return null;
  }
}

/** The small glyph in front of a tool's name (Paper 03, 04). */
export const TOOL_GLYPH: Record<ToolKind, string> = {
  idea: "★", overview: "⌂", board: "▥", list: "☰", calendar: "▦", timeline: "≡", milestones: "⚑", results: "◎", files: "▣",
  doc: "▤", checklist: "☑", table: "▦", links: "↗", requests: "✉", team: "☺", activity: "∿", agent: "✦",
};

/**
 * Where a dragged section lands when dropped on another: the id of the tool it goes before (null: the end), or undefined when
 * nothing would change. Dropped on the upper half it goes before the target, on the lower half before the target's next sibling.
 */
export function dropBefore(page: ProjectPage, draggedId: string, overId: string, upperHalf: boolean): string | null | undefined {
  const dragged = page.tools.findIndex((tool) => tool.id === draggedId);
  const over = page.tools.findIndex((tool) => tool.id === overId);
  if (dragged < 0 || over < 0 || draggedId === overId) return undefined;
  const slot = upperHalf ? over : over + 1;
  if (slot === dragged || slot === dragged + 1) return undefined;
  return page.tools[slot]?.id ?? null;
}

/** Move up / Move down: the id of the tool the section goes before (null: the end). */
export function stepBefore(page: ProjectPage, toolId: string, direction: "up" | "down"): string | null | undefined {
  const at = page.tools.findIndex((tool) => tool.id === toolId);
  if (at < 0) return undefined;
  if (direction === "up") return at > 0 ? page.tools[at - 1].id : undefined;
  return at < page.tools.length - 1 ? page.tools[at + 2]?.id ?? null : undefined;
}

/**
 * The tools that fill their page when they come first (Paper "Jira pages · new header"): no section frame, no name row,
 * the page header is theirs. More Jira pages join as they are matched to Paper; the Files page has its own rule (FIL settings).
 */
export const FILLS_PAGE: ReadonlySet<ToolKind> = new Set<ToolKind>(["board", "list", "overview", "calendar"]);

/** Whether this tool fills its page: it is the page's first tool and its kind draws the whole page. */
export const fillsPage = (page: Pick<ProjectPage, "tools">, tool: Pick<ToolInstance, "id" | "kind">): boolean =>
  page.tools[0]?.id === tool.id && FILLS_PAGE.has(tool.kind);
