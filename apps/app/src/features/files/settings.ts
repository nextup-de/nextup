// The Files page's settings (Paper "Files · 3", frames 7.1-7.3): the page shows the file browser only; what used to
// stack under it (the idea, connected tools, sources, the page's other tools) opens from the gear in the page header.
import type { ProjectPage, ToolInstance } from "@/features/projects/types";

/** A page whose first tool is Files is a Files page: the browser fills it and the gear holds the rest. */
export const isFilesPage = (page: Pick<ProjectPage, "tools">): boolean => page.tools[0]?.kind === "files";

/** The tools a Files page keeps behind the gear: every tool after the file browser, in page order. */
export const toolsBehindGear = (page: Pick<ProjectPage, "tools">): ToolInstance[] => (isFilesPage(page) ? page.tools.slice(1) : []);

/** Which sheet the gear has open: one of the fixed rows, or one of the page's tools by id. */
export type FilesSheet = { kind: "tools" } | { kind: "sources" } | { kind: "tool"; id: string };
