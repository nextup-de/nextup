import { createElement as h } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { beforeEach, expect, it, vi } from "vitest";
import type { FileRow } from "@/features/files/items";
import type { ReducedProject } from "@/features/projects/types";
import { createT } from "@/i18n";
import { I18nProvider } from "@/i18n/client";

const mocks = vi.hoisted(() => ({ sent: [] as unknown[], linked: [] as unknown[][], fetched: [] as string[], token: "tok" as string | null, user: true }));
vi.mock("@/components/dashboard/DemoProvider", () => ({
  useDemo: () => ({ href: (path: string) => "/acme" + path, act: { project: { link: (...args: unknown[]) => mocks.linked.push(args) } } }),
}));
vi.mock("@/components/projects/parts", () => ({ useSend: () => (type: string, payload: unknown, go: () => void) => { mocks.sent.push([type, payload]); go(); return true; } }));
vi.mock("@/components/projects/files/FileList", () => ({ FileList: () => h("div", { "data-testid": "stale-list" }, "LIST") }));
vi.mock("@/features/auth/session", () => ({ getViewer: async () => (mocks.user ? { companyId: "c1", userId: "u1" } : null) }));
vi.mock("@/server/graph-token", () => ({ graphAccessToken: async () => mocks.token }));

const { FileStates } = await import("@/components/projects/files/FileStates");
const { FolderPicker, folderEvent } = await import("@/components/projects/files/FolderPicker");
const { SourcePopover, folderPathOf, agoText } = await import("@/components/projects/files/SourcePopover");
const { searchFoldersAction, childFoldersAction } = await import("@/server/actions/folder-picker");

const t = createT("en");
const url = "https://plant.sharepoint.com/sites/Line-stop%20alerts/Shared%20documents";
const row = (name: string): FileRow => ({ id: name, name, kind: "pdf", ext: "pdf", size: 1, isFolder: false, childCount: 0, modifiedBy: "", modifiedAt: "", createdBy: "", createdAt: "", webUrl: "", parentPath: "" });
const p = { id: "pj2", title: "Line-stop alerts", lead: "S. Tran", links: [], steps: [] } as unknown as ReducedProject;
const link = { system: "sharepoint", url, key: "", stepId: null, day: 0 };
const actions = { open: vi.fn(), goTo: vi.fn(), select: vi.fn(), setView: vi.fn(), setQuery: vi.fn(), setFilter: vi.fn(), setSort: vi.fn(), showMore: vi.fn(), reload: vi.fn(), openDialog: vi.fn(), closeDialog: vi.fn() };
const base = { p, folder: link, path: ["Supplier data", "Pilot photos"], answer: "loading" as unknown, loaded: [] as FileRow[], rows: [], next: null, selected: null, view: "list" as const, query: "", filter: "all" as const, sort: { field: "name" as const, direction: "asc" as const }, dialog: null as unknown, busy: false, editor: true };
const part = (patch: Record<string, unknown> = {}) => ({ state: { ...base, ...patch } as never, actions });
const render = (node: React.ReactNode, locale: "en" | "de" = "en") => renderToStaticMarkup(h(I18nProvider, { locale, children: node }));

beforeEach(() => { mocks.sent.length = 0; mocks.linked.length = 0; mocks.fetched.length = 0; mocks.token = "tok"; mocks.user = true; vi.unstubAllGlobals(); });

it("FIL states: an empty folder offers upload and asking the team", () => {
  const html = render(h(FileStates, part({ answer: { state: "empty" } })));
  expect(html).toContain(t("projectFiles.emptyFolderTitle", { folder: "Pilot photos" }));
  expect(html).toContain(t("projectFiles.emptyFolderHint"));
  expect(html).toContain(t("projectFiles.askTeamForFiles"));
  expect(html).toContain("+ " + t("projectFiles.upload"));
  expect(render(h(FileStates, part({ answer: { state: "empty" }, editor: false })))).not.toContain(t("projectFiles.askTeamForFiles"));
});

it("FIL states: offline shows the banner with Try again and keeps the last list", () => {
  const html = render(h(FileStates, part({ answer: { state: "offline" }, loaded: [row("a.pdf")] })));
  expect(html).toContain('role="alert"');
  expect(html).toContain(t("projectFiles.retry"));
  expect(html).toContain('data-testid="stale-list"');
  expect(render(h(FileStates, part({ answer: { state: "offline" } })))).not.toContain("stale-list");
});

it("FIL states: a project without a folder shows Not connected, with Choose a folder for editors and the lead's name for the rest", () => {
  const html = render(h(FileStates, part({ answer: { state: "not-connected" }, folder: null })));
  expect(html).toContain(t("projectFiles.notConnectedTitle"));
  expect(html).toContain(t("projectFiles.ncStep1Title"));
  expect(html).toContain(t("projectFiles.connect"));
  const viewer = render(h(FileStates, part({ answer: { state: "not-connected" }, folder: null, editor: false })));
  expect(viewer).toContain(t("projectFiles.ncAsk", { name: "S. Tran" }));
  expect(viewer).not.toContain(t("projectFiles.connect"));
  // A person without a Microsoft token is sent to their profile.
  expect(render(h(FileStates, part({ answer: { state: "not-connected" } })))).toContain('href="/acme/profile"');
  expect(render(h(FileStates, part({ answer: { state: "not-connected" }, folder: null })), "de")).toContain("SharePoint-Ordner verbinden");
});

it("FIL states: the picker takes a pasted link and appends project.linked with system sharepoint and no step", () => {
  expect(render(h(FolderPicker, part()))).toBe("");
  expect(render(h(FolderPicker, part({ dialog: { kind: "picker" }, editor: false })))).toBe("");
  const html = render(h(FolderPicker, part({ dialog: { kind: "picker" } })));
  expect(html).toContain(t("projectFiles.pasteLabel"));
  expect(html).toContain(t("projectFiles.pickerSearchPlaceholder"));
  expect(html).toContain(t("projectFiles.useThisFolder"));
  expect(html).toContain(t("projectFiles.pickerFor", { project: "Line-stop alerts" }));
  expect(folderEvent("  " + url + " ")).toEqual({ url, system: "sharepoint", key: "" });
});

it("FIL states: the picker searches folders by name and browses down, as the person, with their own token", async () => {
  const item = (id: string, name: string, extra: Record<string, unknown> = {}) => ({ id, name, webUrl: `https://plant.sharepoint.com/${name}`, folder: { childCount: 3 }, parentReference: { driveId: "b!drive", path: "/drives/b!drive/root:/Plant Süd" }, ...extra });
  vi.stubGlobal("fetch", vi.fn(async (u: string, init: { headers: Record<string, string> }) => {
    mocks.fetched.push(u + "|" + init.headers.authorization);
    return new Response(JSON.stringify({ value: [item("f1", "Shared documents"), item("x", "notes.txt", { folder: undefined }), { id: "f2", name: "No drive", folder: {}, webUrl: "https://x" }] }), { status: 200 });
  }));
  const found = await searchFoldersAction("o'brien shared");
  expect(found).toEqual({ state: "ok", folders: [{ id: "f1", driveId: "b!drive", name: "Shared documents", webUrl: "https://plant.sharepoint.com/Shared documents", path: "Plant Süd", count: 3 }] });
  expect(mocks.fetched[0]).toContain("search(q='o''brien%20shared')");
  expect(mocks.fetched[0]).toContain("|Bearer tok");
  expect(await childFoldersAction("b!drive", "f1")).toMatchObject({ state: "ok" });
  expect(mocks.fetched[1]).toContain("/drives/b!drive/items/f1/children");
  expect(await childFoldersAction("../x", "f1")).toEqual({ state: "no-access" });
  expect(await searchFoldersAction("   ")).toEqual({ state: "ok", folders: [] });
  mocks.token = null;
  expect(await searchFoldersAction("a")).toEqual({ state: "not-connected" });
  mocks.token = "tok"; mocks.user = false;
  expect(await searchFoldersAction("a")).toEqual({ state: "no-access" });
  mocks.user = true;
  vi.stubGlobal("fetch", vi.fn(async () => new Response("", { status: 503 })));
  expect(await searchFoldersAction("a")).toEqual({ state: "offline" });
});

it("FIL states: the pill's popover shows the folder, how fresh the list is, Sync now, Change folder and Open in SharePoint", () => {
  expect(render(h(SourcePopover, part()))).toBe("");
  const html = render(h(SourcePopover, part({ dialog: { kind: "source" }, answer: { state: "ok", rows: [], next: null }, loaded: [row("a.pdf"), row("b.pdf")] })));
  expect(html).toContain(t("projectFiles.popoverTitle"));
  expect(html).toContain("plant.sharepoint.com › Line-stop alerts › Shared documents");
  expect(html).toContain(t("projectFiles.syncNow"));
  expect(html).toContain(t("projectFiles.changeFolderMore"));
  expect(html).toContain(t("projectFiles.pickerFiles", { count: 2 }));
  expect(html).toContain(`href="${url}"`);
  expect(render(h(SourcePopover, part({ dialog: { kind: "source" }, editor: false })))).not.toContain(t("projectFiles.changeFolderMore"));
  expect(folderPathOf(url)).toBe("plant.sharepoint.com › Line-stop alerts › Shared documents");
  expect(agoText(new Date(0), new Date(3 * 60_000), "en")).toBe("3 minutes ago");
});
