// The Projects sidebar (Paper page "Projects page", frames C1-C6, D1-D2): which ideas and projects layer 1
// lists and in what order, the mark each one draws, and the pages layer 2 shows for one of them - the
// standard pages (six for a project; Overview, Files and Chats for an idea) plus the pages a team adds
// itself, in the order the team dragged them. Pure: state in, plain facts out.
import { PROJECT_TABS } from "./tabs";
import type { ProjectStatus, ReducedProject } from "./types";

/** The address of one project's page (/projects/<id>), or null: the list and the area's other pages are not one. */
export function projectIdAt(path: string): string | null {
  const m = /^\/projects\/([^/?#]+)\/?$/.exec(path);
  return m && m[1] !== "collaboration" && m[1] !== "progress" ? decodeURIComponent(m[1]) : null;
}

/** The address of one idea's page (/cases/<id>), or null. */
export function caseIdAt(path: string): string | null {
  const m = /^\/cases\/([^/?#]+)\/?$/.exec(path);
  return m ? decodeURIComponent(m[1]) : null;
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

// ── Ideas in layer 1 ────────────────────────────────────────────────────────────────────────────────

/** Where an open idea stands: on the team lead's desk, or talked over on its way to a decision. */
export type IdeaStage = "lead" | "decision";
/** What layer 1 needs of an Overview row (features/cases/rows.ts DashRow). */
export type IdeaRowFacts = { id: string; title: string; open: boolean; paused: boolean; overdue: boolean; talk: boolean; status: string; archive: unknown; sortDay: number };
export type SidebarIdea = { id: string; title: string; stage: IdeaStage; late: boolean; yourMove: boolean };

/** The ideas still moving (the Overview's "Open"), by stage: late ones first, then your move, then the newest. */
export function sidebarIdeas(rows: readonly IdeaRowFacts[], yourMove: (id: string) => boolean, query = ""): SidebarIdea[] {
  const q = query.trim().toLowerCase();
  return rows
    .filter((r) => r.archive === null && (r.open || r.paused) && (!q || r.title.toLowerCase().includes(q)))
    .map((r) => ({ id: r.id, title: r.title, stage: (r.talk ? "decision" : "lead") as IdeaStage, late: r.overdue, yourMove: yourMove(r.id), sortDay: r.sortDay }))
    .sort((a, b) => Number(b.late) - Number(a.late) || Number(b.yourMove) - Number(a.yourMove) || b.sortDay - a.sortDay)
    .map((i) => ({ id: i.id, title: i.title, stage: i.stage, late: i.late, yourMove: i.yourMove }));
}

/** May this person add and edit an idea's pages? Anyone added to it who is not only a viewer: who raised it, who has it, who was invited to talk it over, and a manager. */
export function mayEditIdeaPages(c: { fromUserId: string | null; discussion?: { invitedUserIds: string[] } | null }, who: { userId: string | null; manager: boolean; holdsDesk: boolean }): boolean {
  if (who.manager || who.holdsDesk) return true;
  return who.userId !== null && (c.fromUserId === who.userId || (c.discussion?.invitedUserIds ?? []).includes(who.userId));
}

// ── The pages of one project or idea ────────────────────────────────────────────────────────────────────────

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

/** An idea's standard pages (D2). A project's are its six tabs (PROJECT_TABS). */
export const IDEA_TABS = ["overview", "files", "chats"] as const;
export type IdeaTab = (typeof IDEA_TABS)[number];

/** One entry of layer 2's list: a standard page by its key, or one the team added. */
export type PageEntry = { kind: "tab"; key: string } | { kind: "custom"; page: CustomPage };

/** Every page in its order: the saved order first, then a standard page or custom page it does not name yet. */
export function pageList(s: PagesState, tabs: readonly string[] = PROJECT_TABS): PageEntry[] {
  const byId = new Map(s.pages.map((p) => [p.id, p]));
  const keys = [...new Set([...s.order.filter((k) => tabs.includes(k) || byId.has(k)), ...tabs, ...s.pages.map((p) => p.id)])];
  return keys.map((k) => (byId.has(k) ? { kind: "custom", page: byId.get(k)! } : { kind: "tab", key: k }));
}

const keyOf = (e: PageEntry) => (e.kind === "tab" ? e.key : e.page.id);

export function addPage(s: PagesState, kind: PageKind, id: string, title: string, tabs: readonly string[] = PROJECT_TABS): PagesState {
  const page: CustomPage = {
    id, kind, title, icon: ICON_OF[kind], body: "", url: "",
    items: [], rows: kind === "table" ? [["", "", ""], ["", "", ""]] : [],
  };
  return { order: [...pageList(s, tabs).map(keyOf), id], pages: [...s.pages, page] };
}

/** Change a custom page (title, icon, content); the standard tabs are not edited here. An empty title keeps the old one. */
export function updatePage(s: PagesState, id: string, patch: Partial<Omit<CustomPage, "id" | "kind">>): PagesState {
  const clean = patch.title !== undefined && !patch.title.trim() ? { ...patch, title: undefined } : patch;
  return { ...s, pages: s.pages.map((p) => (p.id === id ? { ...p, ...Object.fromEntries(Object.entries(clean).filter(([, v]) => v !== undefined)) } : p)) };
}

/** Delete a custom page. The standard pages can be moved but never deleted. */
export function removePage(s: PagesState, id: string): PagesState {
  if (!s.pages.some((p) => p.id === id)) return s;
  return { order: s.order.filter((k) => k !== id), pages: s.pages.filter((p) => p.id !== id) };
}

/** Drag `id` so it lands right before `before` (null: at the end). */
export function movePage(s: PagesState, id: string, before: string | null, tabs: readonly string[] = PROJECT_TABS): PagesState {
  const keys = pageList(s, tabs).map(keyOf);
  if (!keys.includes(id) || id === before) return s;
  const rest = keys.filter((k) => k !== id);
  const at = before === null ? rest.length : rest.indexOf(before);
  if (at < 0) return s;
  return { ...s, order: [...rest.slice(0, at), id, ...rest.slice(at)] };
}
