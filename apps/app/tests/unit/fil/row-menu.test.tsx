import { createElement as h } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import type { FilesActions, FilesState } from "@/components/projects/files/types";
import type { FileRow } from "@/features/files/items";
import { recycleBinUrl, rowMenuItems, rx } from "@/features/files/remove";
import type { ReducedProject } from "@/features/projects/types";
import { I18nProvider } from "@/i18n/client";

const rights = vi.hoisted(() => ({ linked: true }));
vi.mock("@/components/dashboard/DemoProvider", () => ({ useDemo: () => ({ showToast: () => {}, serverMode: false }) }));
vi.mock("@/components/projects/parts", () => ({ useRights: () => ({ check: () => ({ ok: rights.linked }) }) }));
vi.mock("@/server/actions/project-files-remove", () => ({ deleteFileAction: async () => ({ state: "ok" }) }));
vi.mock("@/server/graph-token", () => ({ graphAccessToken: vi.fn(async () => "tok-SECRET") }));

import { DeleteDialog } from "@/components/projects/files/DeleteDialog";
import { RowMenu } from "@/components/projects/files/RowMenu";
import { removeItem } from "@/server/files/remove";

const FOLDER = "https://acme.sharepoint.com/sites/purchasing/Shared%20Documents/Supplier%20data";
const file = { id: "f1", name: "brose-sla-2026.pdf", kind: "pdf", ext: "pdf", size: 1200000, isFolder: false, childCount: 0, modifiedBy: "You", modifiedAt: "2026-11-06T10:00:00Z", createdBy: "You", createdAt: "2026-10-01T10:00:00Z", webUrl: FOLDER + "/brose-sla-2026.pdf", parentPath: "" } as FileRow;
const folder = { ...file, id: "d1", name: "Delivery reports Q3", kind: "folder", isFolder: true } as FileRow;
const p = { links: [{ system: "sharepoint", url: FOLDER, key: "", stepId: null, day: 0 }, { system: "sharepoint", url: file.webUrl, key: "", stepId: "s1", day: 1 }], steps: [{ id: "s1", text: "Sign SLA", external: { system: "jira", key: "KAN-17" } }] } as unknown as ReducedProject;
const noop = () => {};
const actions: FilesActions = { open: noop, goTo: noop, select: noop, setView: noop, setQuery: noop, setFilter: noop, setSort: noop, showMore: noop, reload: noop, openDialog: noop, closeDialog: noop };
const state = (dialog: FilesState["dialog"]): FilesState => ({ p, folder: p.links[0], path: [], answer: "loading", loaded: [], rows: [], next: null, selected: null, view: "list", query: "", filter: "all", sort: { field: "name", direction: "asc" }, dialog, busy: false, editor: true } as unknown as FilesState);
const render = (node: React.ReactNode, locale: "en" | "de" = "en") => renderToStaticMarkup(h(I18nProvider, { locale, children: node }));

describe("FIL row menu", () => {
  it("FIL row menu: the menu offers Open, Open in browser, Download, Copy link, Link to step, Show history and Delete for a file", () => {
    expect(rowMenuItems(file, { editor: true })).toEqual(["open", "openInBrowser", "download", "copyLink", "linkToStep", "history", "rename", "move", "delete"]);
    expect(rowMenuItems(folder, { editor: true })).toEqual(["open", "openInBrowser", "copyLink", "rename", "move", "delete"]);
    const html = render(h(RowMenu, { state: state({ kind: "row-menu", row: file }), actions }));
    for (const text of ["Open", "In browser", "Download", "Copy link", "Link to a step…", "Version history", "Delete…"]) expect(html).toContain(text);
    expect(html).toContain('aria-label="Actions for brose-sla-2026.pdf"');
    expect(render(h(RowMenu, { state: state(null), actions }))).not.toContain("role=\"menu\"");
  });

  it("FIL row menu: Delete is hidden for a person who may not append project.linked", () => {
    expect(rowMenuItems(file, { editor: false })).not.toContain("delete");
    expect(rowMenuItems(file, { editor: false })).not.toContain("linkToStep");
    rights.linked = false;
    const html = render(h(RowMenu, { state: state({ kind: "row-menu", row: file }), actions }));
    expect(html).not.toContain("Delete…");
    expect(html).toContain("Copy link");
    rights.linked = true;
  });

  it("FIL row menu: Delete asks first, names the step links it leaves behind and says where the file goes", () => {
    const html = render(h(DeleteDialog, { state: state({ kind: "delete", row: file }), actions }));
    expect(html).toContain("Delete brose-sla-2026.pdf?");
    expect(html).toContain("SharePoint recycle bin");
    expect(html).toContain("KAN-17");
    expect(html).toContain("Keep it");
    expect(html).toMatch(/<button[^>]*>Delete<\/button>/);
    const plain = render(h(DeleteDialog, { state: state({ kind: "delete", row: { ...file, webUrl: "https://t/none" } }), actions }));
    expect(plain).not.toContain("Still linked");
    expect(render(h(DeleteDialog, { state: state(null), actions }))).not.toContain("<h2");
    expect(render(h(DeleteDialog, { state: state({ kind: "delete", row: file }), actions }), "de")).toContain("brose-sla-2026.pdf löschen?");
  });

  it("FIL row menu: the recycle bin link points at the site's RecycleBin page, and the texts exist in both languages", () => {
    expect(recycleBinUrl(FOLDER)).toBe("https://acme.sharepoint.com/sites/purchasing/_layouts/15/RecycleBin.aspx");
    expect(recycleBinUrl("https://acme.sharepoint.com/Shared%20Documents/x")).toBe("https://acme.sharepoint.com/_layouts/15/RecycleBin.aspx");
    expect(recycleBinUrl("nope")).toBeNull();
    expect(rx("en", "openRecycleBin")).toBe("Open recycle bin");
    expect(rx("de", "deletedOk", { name: "a.pdf" })).toBe("a.pdf gelöscht. Es liegt im Papierkorb.");
  });

  describe("FIL row menu: the server moves an item of the shared folder to the recycle bin", () => {
    let calls: { url: string; method: string }[] = [];
    const root = { id: "ROOT", name: "Supplier data", parentReference: { driveId: "b!drive", path: "/drives/b!drive/root:/Shared Documents" } };
    const inside = { id: "f1", name: "a.pdf", parentReference: { driveId: "b!drive", path: "/drives/b!drive/root:/Shared Documents/Supplier data" } };
    const elsewhere = { id: "f2", name: "b.pdf", parentReference: { driveId: "b!drive", path: "/drives/b!drive/root:/Other site" } };
    const fake = (item: unknown, deleteStatus = 204) => vi.stubGlobal("fetch", vi.fn(async (url: string, init: RequestInit) => {
      calls.push({ url, method: String(init.method) });
      if (init.method === "DELETE") return new Response(null, { status: deleteStatus });
      return Response.json(url.includes("/shares/") ? root : item);
    }));
    beforeEach(() => { calls = []; vi.spyOn(console, "info").mockImplementation(() => {}); vi.spyOn(console, "warn").mockImplementation(() => {}); });
    afterEach(() => vi.unstubAllGlobals());

    it("FIL row menu: an item inside the folder is deleted with DELETE, one outside it is refused before DELETE", async () => {
      fake(inside);
      expect(await removeItem({ companyId: "c", userId: "u" }, "u!share", "f1")).toEqual({ state: "ok" });
      expect(calls.at(-1)).toEqual({ url: "https://graph.microsoft.com/v1.0/drives/b!drive/items/f1", method: "DELETE" });
      calls = [];
      fake(elsewhere);
      expect(await removeItem({ companyId: "c", userId: "u" }, "u!share", "f2")).toEqual({ state: "no-access" });
      expect(calls.some((c) => c.method === "DELETE")).toBe(false);
      fake(root);
      expect(await removeItem({ companyId: "c", userId: "u" }, "u!share", "ROOT")).toEqual({ state: "no-access" });
      expect(await removeItem({ companyId: "c", userId: "u" }, "u!share", "../x")).toEqual({ state: "no-access" });
    });

    it("FIL row menu: Graph's answers map to gone, no-access and offline, and nothing throws", async () => {
      for (const [status, state] of [[404, "gone"], [403, "no-access"], [401, "not-connected"], [500, "offline"]] as const) {
        fake(inside, status);
        expect(await removeItem({ companyId: "c", userId: "u" }, "u!share", "f1")).toEqual({ state });
      }
      vi.stubGlobal("fetch", vi.fn(async () => { throw new TypeError("fetch failed"); }));
      expect(await removeItem({ companyId: "c", userId: "u" }, "u!share", "f1")).toEqual({ state: "offline" });
    });
  });
});
