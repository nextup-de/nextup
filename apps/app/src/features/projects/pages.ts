// Pages are named stacks of tool instances. Pure facts and checks shared by the reducer, rights and UI.
import type { PageIconKey, ProjectPage, ReducedProject, ToolInstance, ToolKind } from "./types";

export const TOOL_KINDS = ["overview", "board", "list", "calendar", "timeline", "milestones", "results", "files", "doc", "checklist", "table", "links", "requests", "team", "activity", "agent"] as const satisfies readonly ToolKind[];
export const SINGLE_KINDS: readonly ToolKind[] = ["overview", "agent"];
export const PAGE_ICON_KEYS = ["home", "board", "list", "calendar", "timeline", "flag", "target", "folder", "link", "inbox", "people", "pulse", "doc", "checklist", "table", "star", "chat", "box"] as const satisfies readonly PageIconKey[];
export const EVENT_BUDGET = 12_000;
export const fitsEvent = (payload: unknown): boolean => JSON.stringify(payload).length <= EVENT_BUDGET;
export const NOT_SYNCED_PREFIXES = ["project.page.", "project.tool.", "project.milestone.", "project.form."] as const;
export const kicksJira = (type: string): boolean => type.startsWith("project.") && !NOT_SYNCED_PREFIXES.some((prefix) => type.startsWith(prefix));

export const TOOL_GROUPS = [
  { title: "projectPages.groupSteps", kinds: ["board", "list", "calendar", "timeline", "milestones"] },
  { title: "projectPages.groupWrite", kinds: ["doc", "files", "links", "checklist", "table"] },
  { title: "projectPages.groupCollect", kinds: ["requests", "results"] },
  { title: "projectPages.groupProject", kinds: ["overview", "team", "activity", "agent"] },
] as const satisfies readonly { title: string; kinds: readonly ToolKind[] }[];

export const isJiraTool = (kind: ToolKind): boolean => (["board", "list", "calendar", "timeline"] as readonly ToolKind[]).includes(kind);
export const LIMITS = { pages: 24, tools: 24, titleMin: 1, titleMax: 60, removedDays: 30 } as const;

const defaultPage = (id: string, title: string, icon: PageIconKey, kinds: ToolKind[]): ProjectPage => ({
  id, title, icon,
  tools: kinds.map((kind) => ({ id: `${id}.${kind}`, kind, title: null, collapsed: false, content: null, rev: 0 })),
});

/** Default titles are message keys; a title written by a page event is the team's own text. */
export const DEFAULT_PAGES: ProjectPage[] = [
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
