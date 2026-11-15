import { tabToPage } from "./pages";
import type { ProjectPage } from "./types";

/** Resolve only against the viewer's pagesOf result, including its Agent visibility filter. */
export function pageIdFor(pages: ProjectPage[], query: { page?: string | null; tab?: string | null }): string {
  const requested = query.page ?? (query.tab ? tabToPage(query.tab) : null);
  return pages.find((page) => page.id === requested)?.id ?? pages[0]?.id ?? "";
}

/** The setup page of a draft that has not started (plan SET): listed first in the sidebar, before its Idea and Files. */
export const SETUP_PAGE = "setup";

/** Does this address show the draft's setup? Only while it is an open draft, and only when no other page was asked for. */
export function showsSetup(openDraft: boolean, page: string | null | undefined): boolean {
  return openDraft && (!page || page === SETUP_PAGE);
}
