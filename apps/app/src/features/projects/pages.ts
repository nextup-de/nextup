// Pages are named stacks of tool instances. Pure facts and checks shared by the reducer, rights and UI.
import type { PageIconKey, ProjectPage, ReducedProject, ToolInstance, ToolKind } from "./types";

export const TOOL_KINDS = ["idea", "overview", "board", "list", "calendar", "timeline", "milestones", "results", "files", "doc", "checklist", "table", "links", "requests", "team", "activity", "agent"] as const satisfies readonly ToolKind[];
export const SINGLE_KINDS: readonly ToolKind[] = ["idea", "overview", "agent"];
export const PAGE_ICON_KEYS = ["home", "board", "list", "calendar", "timeline", "flag", "target", "folder", "link", "inbox", "people", "pulse", "doc", "checklist", "table", "star", "chat", "box"] as const satisfies readonly PageIconKey[];
export const EVENT_BUDGET = 12_000;
export const fitsEvent = (payload: unknown): boolean => JSON.stringify(payload).length <= EVENT_BUDGET;
export const NOT_SYNCED_PREFIXES = ["project.page.", "project.tool.", "project.form.", "project.step.checklist", "project.step.commented"] as const;
export const kicksJira = (type: string): boolean => type.startsWith("project.") && !NOT_SYNCED_PREFIXES.some((prefix) => type.startsWith(prefix));

export const TOOL_GROUPS = [
  { title: "projectPages.groupSteps", kinds: ["board", "list", "calendar", "timeline", "milestones"] },
  { title: "projectPages.groupWrite", kinds: ["doc", "files", "links", "checklist", "table"] },
  { title: "projectPages.groupCollect", kinds: ["requests", "results"] },
  { title: "projectPages.groupProject", kinds: ["idea", "overview", "team", "activity", "agent"] },
] as const satisfies readonly { title: string; kinds: readonly ToolKind[] }[];

export const isJiraTool = (kind: ToolKind): boolean => (["board", "list", "calendar", "timeline"] as readonly ToolKind[]).includes(kind);
export const LIMITS = { pages: 24, tools: 24, titleMin: 1, titleMax: 60, removedDays: 30 } as const;

const defaultPage = (id: string, title: string, icon: PageIconKey, kinds: ToolKind[]): ProjectPage => ({
  id, title, icon,
  tools: kinds.map((kind) => ({ id: `${id}.${kind}`, kind, title: null, collapsed: false, content: null, rev: 0 })),
});

/**
 * The pages every project had before its Idea and Files became the start. Tests use them as a project with many
 * pages; titles here are message keys too.
 */
export const READY_PAGES: ProjectPage[] = [
  defaultPage("overview", "projectPages.pageOverview", "home", ["overview"]),
  defaultPage("steps", "projectPages.pageSteps", "board", ["board", "list"]),
  defaultPage("plan", "projectPages.pagePlan", "calendar", ["calendar", "timeline", "milestones"]),
  defaultPage("results", "projectPages.pageResults", "target", ["results"]),
  defaultPage("files", "projectPages.pageFiles", "folder", ["files", "links"]),
  defaultPage("requests", "projectPages.pageRequests", "inbox", ["requests"]),
  defaultPage("team", "projectPages.pageTeam", "people", ["team"]),
  defaultPage("activity", "projectPages.pageActivity", "pulse", ["activity"]),
  defaultPage("agent", "projectPages.pageAgent", "chat", ["agent"]),
];

/**
 * Default titles are message keys; a title written by a page event is the team's own text. An idea and a project
 * are one thing to the people working on it: every project starts with its Idea (the idea it grew from, as the
 * idea page shows it) and its Files. The first page keeps the id "overview" so old links (?tab=overview) and
 * page events still find it; it is the one page that cannot be removed. The rest the team adds itself (Add page).
 */
export const DEFAULT_PAGES: ProjectPage[] = [
  defaultPage("overview", "projectPages.pageIdea", "star", ["idea"]),
  defaultPage("files", "projectPages.pageFiles", "folder", ["files", "links"]),
];

/**
 * The ready-made pages Add page offers with one click: the old pages, under their old ids so ?page=steps and the like
 * keep working. Files is already there from the start; the project Overview gets its own id, because "overview" is the
 * Idea page now. Tool ids are minted when the page is added.
 */
export const ADDABLE_PAGES: ProjectPage[] = READY_PAGES.filter((page) => page.id !== "files")
  .map((page) => page.id === "overview" ? { ...page, id: "project-overview" } : page);

/** The ready-made pages this project can still add: not there, not recently removed, and no single tool twice. */
export function addablePages(pages: readonly ProjectPage[], removedIds: readonly string[], { agent }: { agent: boolean }): ProjectPage[] {
  const kinds = new Set(pages.flatMap((page) => page.tools.map((tool) => tool.kind)));
  return ADDABLE_PAGES.filter((ready) => !pages.some((page) => page.id === ready.id) && !removedIds.includes(ready.id)
    && ready.tools.every((tool) => (agent || tool.kind !== "agent") && !(SINGLE_KINDS.includes(tool.kind) && kinds.has(tool.kind))));
}

/** Is this page's title one of the message keys a default or ready-made page carries (translate it), or the team's own text? */
export const hasDefaultTitle = (page: Pick<ProjectPage, "id" | "title">): boolean =>
  [...DEFAULT_PAGES, ...READY_PAGES, ...ADDABLE_PAGES].some((entry) => entry.id === page.id && entry.title === page.title);

/** Removed items live in p.removed, outside this active list. Return fresh objects so defaults stay reusable. */
export function pagesOf(p: Pick<ReducedProject, "pages">, { agent }: { agent: boolean }): ProjectPage[] {
  return (p.pages ?? DEFAULT_PAGES)
    .map((page) => ({ ...page, tools: page.tools.filter((tool) => agent || tool.kind !== "agent").map((tool) => ({ ...tool })) }))
    .filter((page) => agent || page.tools.length > 0);
}

export function canAddTool(pages: readonly ProjectPage[], page: ProjectPage, kind: ToolKind, { agent }: { agent: boolean }): boolean {
  return TOOL_KINDS.includes(kind) && page.tools.length < LIMITS.tools && (kind !== "agent" || agent)
    && (!SINGLE_KINDS.includes(kind) || !pages.some((p) => p.tools.some((tool) => tool.kind === kind)));
}

export function suggestPageName(kinds: readonly ToolKind[]): string[] {
  const unique = [...new Set(kinds)];
  if (unique.length === 1) return [`projectPages.tool${unique[0][0].toUpperCase()}${unique[0].slice(1)}`];
  if (unique.includes("calendar") && unique.includes("timeline")) return ["projectPages.nameSuggestPlan", "projectPages.nameSuggestSchedule", "projectPages.nameSuggestDates"];
  if (unique.includes("board") || unique.includes("list")) return ["projectPages.nameSuggestSteps"];
  return ["projectPages.nameSuggestPage"];
}

/** A refused merge moves nothing. Repeated tool kinds retain their own identity and content. */
export function mergePlan(into: ProjectPage, from: ProjectPage): { moved: ToolInstance[]; refused: null | "overview" | "tooMany" } {
  if (from.id === "overview") return { moved: [], refused: "overview" };
  if (into.tools.length + from.tools.length > LIMITS.tools) return { moved: [], refused: "tooMany" };
  return { moved: from.tools.map((tool) => ({ ...tool })), refused: null };
}

const LEGACY_TABS: Record<string, string> = { overview: "overview", board: "steps", team: "team", results: "results", activity: "activity", files: "files", agent: "agent" };
export const tabToPage = (tab: string): string | null => LEGACY_TABS[tab] ?? null;
