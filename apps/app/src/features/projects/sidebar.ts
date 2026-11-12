// The Projects sidebar (Paper page "Projects page", frames C1-C6): which projects layer 1 lists and in
// what order, the ring each status draws, and the pages layer 2 shows for one project - the six standard
// tabs plus the pages a team adds itself, in the order the team dragged them. Pure: state in, plain facts out.
import { PROJECT_TABS, type ProjectTab } from "./tabs";
import type { ProjectStatus, ReducedProject } from "./types";

/** The address of one project's page (/projects/<id>), or null: the list and the area's other pages are not one. */
export function projectIdAt(path: string): string | null {
  const m = /^\/projects\/([^/?#]+)\/?$/.exec(path);
  return m && m[1] !== "collaboration" && m[1] !== "progress" ? decodeURIComponent(m[1]) : null;
}

/** The ring in a row's mark slot: it fills as the project moves along. */
export type Ring = "planning" | "running" | "measuring" | "measured" | "stopped";
export const ringOf = (s: ProjectStatus): Ring => (s === "recognised" ? "measured" : s);

const RANK: Record<ProjectStatus, number> = { running: 0, measuring: 1, planning: 2, measured: 3, recognised: 3, stopped: 4 };

/** Layer 1: the open projects first (running, measuring, planning, measured), late ones on top; stopped ones only behind "All projects". */
export function sidebarProjects(list: readonly ReducedProject[], query = ""): ReducedProject[] {
  const q = query.trim().toLowerCase();
  return list
    .filter((p) => p.status !== "stopped" && (!q || p.title.toLowerCase().includes(q)))
    .sort((a, b) => Number(b.overdue) - Number(a.overdue) || RANK[a.status] - RANK[b.status] || a.number - b.number);
}

/** How many days the project's next move is late (0 when it is not). */
export const daysLate = (p: Pick<ReducedProject, "overdue" | "dueDay">, day: number) =>
  p.overdue && p.dueDay !== null ? Math.max(1, day - p.dueDay) : 0;

// ── The pages of one project ────────────────────────────────────────────────────────────────────────

export type PageKind = "page" | "checklist" | "table" | "link";
export const PAGE_KINDS: readonly PageKind[] = ["page", "checklist", "table", "link"];
export type PageIcon = "doc" | "checklist" | "table" | "link" | "flag" | "star" | "chat" | "box";
export const PAGE_ICONS: readonly PageIcon[] = ["doc", "checklist", "table", "link", "flag", "star", "chat", "box"];
const ICON_OF: Record<PageKind, PageIcon> = { page: "doc", checklist: "checklist", table: "table", link: "link" };

export type CheckItem = { id: string; text: string; done: boolean };
/** A page the team added. `body` (page), `items` (checklist), `rows` (table, first row = the header), `url` (link). */
export type CustomPage = { id: string; kind: PageKind; title: string; icon: PageIcon; body: string; items: CheckItem[]; rows: string[][]; url: string };
/** One project's pages: the custom ones and the order of everything (standard tab keys and custom ids mixed). */
export type PagesState = { order: string[]; pages: CustomPage[] };
export const NO_PAGES: PagesState = { order: [], pages: [] };

/** One entry of layer 2's list. */
export type PageEntry = { kind: "tab"; key: ProjectTab } | { kind: "custom"; page: CustomPage };

const isTab = (k: string): k is ProjectTab => (PROJECT_TABS as readonly string[]).includes(k);

/** Every page in its order: the saved order first, then a standard tab or custom page it does not name yet. */
export function pageList(s: PagesState): PageEntry[] {
  const byId = new Map(s.pages.map((p) => [p.id, p]));
  const keys = [...new Set([...s.order.filter((k) => isTab(k) || byId.has(k)), ...PROJECT_TABS, ...s.pages.map((p) => p.id)])];
  return keys.map((k) => (isTab(k) ? { kind: "tab", key: k } : { kind: "custom", page: byId.get(k)! }));
}

const keyOf = (e: PageEntry) => (e.kind === "tab" ? e.key : e.page.id);

export function addPage(s: PagesState, kind: PageKind, id: string, title: string): PagesState {
  const page: CustomPage = {
    id, kind, title, icon: ICON_OF[kind], body: "", url: "",
    items: [], rows: kind === "table" ? [["", "", ""], ["", "", ""]] : [],
  };
  return { order: [...pageList(s).map(keyOf), id], pages: [...s.pages, page] };
}

/** Change a custom page (title, icon, content); the standard tabs are not edited here. An empty title keeps the old one. */
export function updatePage(s: PagesState, id: string, patch: Partial<Omit<CustomPage, "id" | "kind">>): PagesState {
  const clean = patch.title !== undefined && !patch.title.trim() ? { ...patch, title: undefined } : patch;
  return { ...s, pages: s.pages.map((p) => (p.id === id ? { ...p, ...Object.fromEntries(Object.entries(clean).filter(([, v]) => v !== undefined)) } : p)) };
}

/** Delete a custom page. The six standard pages can be moved but never deleted. */
export function removePage(s: PagesState, id: string): PagesState {
  if (isTab(id)) return s;
  return { order: s.order.filter((k) => k !== id), pages: s.pages.filter((p) => p.id !== id) };
}

/** Drag `id` so it lands right before `before` (null: at the end). */
export function movePage(s: PagesState, id: string, before: string | null): PagesState {
  const keys = pageList(s).map(keyOf);
  if (!keys.includes(id) || id === before) return s;
  const rest = keys.filter((k) => k !== id);
  const at = before === null ? rest.length : rest.indexOf(before);
  if (at < 0) return s;
  return { ...s, order: [...rest.slice(0, at), id, ...rest.slice(at)] };
}
