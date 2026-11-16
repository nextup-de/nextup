import { createElement as h } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { beforeEach, expect, it, vi } from "vitest";
import { PageView } from "@/components/projects/page/PageView";
import { headOf, type HeadProps } from "@/components/projects/tools/heads";
import type { ProjectPage, ReducedProject, ToolInstance, ToolKind } from "@/features/projects/types";
import type { JiraRow } from "@/features/projects/views";
import { createT } from "@/i18n";
import { I18nProvider } from "@/i18n/client";

const mocks = vi.hoisted(() => ({ editor: true }));
vi.mock("@/components/projects/parts", () => ({ useRights: () => ({ addStep: mocks.editor }) }));
vi.mock("@/components/projects/draft/useProjectHints", () => ({ useProjectHints: () => ({ stepHints: [] }) }));
vi.mock("@/components/projects/page/ToolSection", () => ({ ToolSection: () => null }));
vi.mock("@/components/projects/page/BrowserPagesImport", () => ({ BrowserPagesImport: () => null }));
vi.mock("@/components/projects/steps/CreateStepDialog", () => ({ CreateStepDialog: () => null }));
vi.mock("@/components/projects/page/AddToolMenu", () => ({ AddToolMenu: () => null }));
// A Files page draws the browser itself and the gear (Paper 7.1); both are tested on their own.
vi.mock("@/components/projects/tools/registry", () => ({ TOOL_REGISTRY: { files: () => null } }));
vi.mock("@/components/projects/files/FilesSettings", () => ({ FilesSettings: () => h("button", { "data-testid": "files-settings" }), useFilesSyncedAgo: () => "3 minutes ago" }));

const t = createT("en");
const tool = (kind: ToolKind): ToolInstance => ({ id: "t-" + kind, kind, title: null, collapsed: false, content: null, rev: 0 });
const page = (title: string, kind: ToolKind): ProjectPage => ({ id: "pg", title, icon: "board", tools: [tool(kind)] });
const synced = { state: "synced", label: "Two-way sync", hint: "", send: null, chip: { tone: "ok", text: "Synced KAN-1, checked 2 min ago" }, projectKey: "KAN", siteUrl: "https://acme.atlassian.net", epicKey: "KAN-1", canLink: true, waiting: true } as JiraRow;
const off = { ...synced, state: "off", chip: null } as JiraRow;
const p = { id: "pj", title: "Project", sync: null, links: [{ system: "sharepoint", url: "https://plant.sharepoint.com/sites/p/Shared", key: "", stepId: null, day: 0 }], steps: [] } as unknown as ReducedProject;
const render = (kind: ToolKind, jira: JiraRow, title = "Board", project = p) => renderToStaticMarkup(h(I18nProvider, { locale: "en", children: h(PageView, { p: project, page: page(title, kind), jira, agent: false }) }));

beforeEach(() => { mocks.editor = true; });

it("FIL page head: a page whose first tool is Board shows Board, the Jira pill with key and sync time, Open in Jira and + Add step", () => {
  const html = render("board", synced);
  expect(html).toContain(">Board</h1>");
  expect(html).toContain(t("projectPages.tagJira"));
  expect(html).toContain("KAN");
  expect(html).toContain("Synced KAN-1, checked 2 min ago");
  expect(html).toContain(`${t("projectPages.openInJira")} <span`);
  expect(html).toContain('href="https://acme.atlassian.net/browse/KAN"');
  expect(html).toContain(t("projectPages.addStep"));
  for (const kind of ["list", "calendar", "timeline"] as const) expect(render(kind, synced)).toContain("browse/KAN");
});

it("FIL page head: the Jira pill and link show only while the project is synced, and + Add step only to who may add a step", () => {
  const html = render("board", off);
  expect(html).not.toContain("browse/KAN");
  expect(html).not.toContain(t("projectPages.tagJira") + "</span><span");
  expect(html).toContain(t("projectPages.addStep"));
  mocks.editor = false;
  expect(render("board", synced)).not.toContain(t("projectPages.addStep"));
  expect(render("board", synced)).toContain("browse/KAN");
});

it("FIL page head: the Files page shows the SharePoint pill, Open in SharePoint and + Upload", () => {
  const html = render("files", off, "Files");
  expect(html).toContain(">Files</h1>");
  expect(html).toContain(t("projectFiles.sharepoint"));
  expect(html).toContain(`${t("projectFiles.openInSharePoint")} <span`);
  expect(html).toContain('href="https://plant.sharepoint.com/sites/p/Shared"');
  expect(html).toContain(t("projectFiles.upload"));
  // The gear sits after + Upload, the pill says when the list last read the folder, and the head carries no tool row.
  expect(html.indexOf('data-testid="files-settings"')).toBeGreaterThan(html.indexOf(t("projectFiles.upload")));
  expect(html).toContain(t("projectFiles.synced", { ago: "3 minutes ago" }));
  expect(html).not.toContain(t("projectPages.toolsCount", { count: 1 }));
  expect(render("files", off, "Files", { ...p, links: [] } as unknown as ReducedProject)).not.toContain(t("projectFiles.openInSharePoint"));
  mocks.editor = false;
  expect(render("files", off, "Files")).not.toContain(">" + "+" + "</span>");
});

it("FIL page head: a page with an unknown first tool shows its title only", () => {
  const html = render("doc", synced, "Notes");
  expect(html).toContain(">Notes</h1>");
  expect(html).not.toContain("browse/KAN");
  expect(html).not.toContain(t("projectPages.addStep"));
  const c = { p, jira: synced, t, editor: true, title: "X", onAddStep: vi.fn(), onFilesUpload: vi.fn(), onFilesSource: vi.fn() } as HeadProps;
  expect(headOf("requests", c)).toEqual({ title: "X" });
  expect(headOf(undefined, c)).toEqual({ title: "X" });
  // The Overview carries the Jira pill while the project syncs, but no Open in Jira and no Add step (Paper "Jira pages · new header").
  const overview = headOf("overview", c);
  expect(overview).toMatchObject({ title: "X", source: { system: "jira" } });
  expect(overview.open).toBeUndefined();
  expect(overview.primary).toBeUndefined();
});
