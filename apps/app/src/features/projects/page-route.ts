import { tabToPage } from "./pages";
import type { ProjectPage } from "./types";

/** Resolve only against the viewer's pagesOf result, including its Agent visibility filter. */
export function pageIdFor(pages: ProjectPage[], query: { page?: string | null; tab?: string | null }): string {
  const requested = query.page ?? (query.tab ? tabToPage(query.tab) : null);
  return pages.find((page) => page.id === requested)?.id ?? pages[0]?.id ?? "";
}
