import { createElement as h } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it, vi } from "vitest";
import { FileIcon } from "@/components/projects/files/FileIcon";
import { FilesView } from "@/components/projects/files/FilesView";
import { filesHead } from "@/components/projects/files/head";
import { PageHead } from "@/components/ui/elements/PageHead";
import type { FileKind } from "@/features/files/items";
import type { ReducedProject } from "@/features/projects/types";
import { createT } from "@/i18n";
import { I18nProvider } from "@/i18n/client";
import { projectFiles } from "@/i18n/messages/projectFiles";

// The filled states read the demo context (the address prefix, the acts); the scaffold test has no provider.
vi.mock("@/components/dashboard/DemoProvider", () => ({ useDemo: () => ({ f: () => "", href: (p: string) => p, S: { day: 0 }, serverMode: false, seed: { seats: [] }, act: { project: { link: () => {} } } }) }));
vi.mock("@/components/projects/parts", () => ({ teamOf: () => [], useSend: () => () => true }));

const KINDS: FileKind[] = ["sheet", "pdf", "doc", "slides", "image", "folder", "other"];
const p = { links: [{ system: "sharepoint", url: "https://t.sharepoint.com/sites/a/Supplier", key: "", stepId: null, day: 0 }], steps: [] } as unknown as ReducedProject;
const render = (node: React.ReactNode, locale: "en" | "de" = "en") => renderToStaticMarkup(h(I18nProvider, { locale, children: node }));

describe("FIL scaffold", () => {
  it("FIL scaffold: PageHead renders the title as h1, the source pill, the open link, the primary button and the filter row", () => {
    const html = render(h(PageHead, {
      title: "Files", source: { system: "sharepoint", label: "SharePoint", key: "Supplier", syncedAt: "Synced 2 min ago", state: "ok" },
      open: { label: "Open in SharePoint", href: "https://t.sharepoint.com/x" }, primary: { label: "Upload", onClick: () => {} },
      children: h("div", { "data-testid": "row" }, "filters"),
    }));
    expect(html).toMatch(/<h1[^>]*>Files<\/h1>/);
    expect(html).toContain("SharePoint");
    expect(html).toContain("Synced 2 min ago");
    expect(html).toMatch(/<a [^>]*href="https:\/\/t\.sharepoint\.com\/x"[^>]*>Open in SharePoint/);
    expect(html).toMatch(/<button[^>]*>Upload<\/button>/);
    expect(html).toContain('data-testid="row"');
    expect(render(h(PageHead, { title: "Only a title" }))).not.toContain("<button");
  });

  it("FIL scaffold: the Files head offers the SharePoint pill and the link only while the project has a folder", () => {
    const t = createT("en");
    const head = filesHead(p, t, { onUpload: () => {}, canUpload: true, syncedAgo: "2 min ago" });
    expect(head).toMatchObject({ title: "Files", source: { system: "sharepoint", label: "SharePoint", syncedAt: "Synced 2 min ago" }, open: { href: "https://t.sharepoint.com/sites/a/Supplier" }, primary: { label: "Upload" } });
    const bare = filesHead({ links: [] }, t, { onUpload: () => {}, canUpload: false });
    expect(bare).toEqual({ title: "Files" });
  });

  it("FIL scaffold: FileIcon draws every kind at every size", () => {
    for (const kind of KINDS) for (const size of [20, 28, 57, 84] as const) {
      const html = renderToStaticMarkup(h(FileIcon, { kind, size }));
      expect(html).toContain(`data-kind="${kind}"`);
      expect(html).toContain(`width="${size}"`);
    }
  });

  it("FIL scaffold: FilesView renders its list card, its side panel and every stub", () => {
    for (const locale of ["en", "de"] as const) {
      const html = render(h(FilesView, { p, load: async () => ({ state: "empty" as const }), editor: true }), locale);
<<<<<<< HEAD
      for (const id of ["files-view", "files-list-card", "files-side", "files-breadcrumb", "files-file-toolbar", "files-drop-zone", "files-file-states", "files-upload-progress", "files-folder-panel", "files-history-panel", "files-upload-menu", "files-row-menu", "files-delete-dialog", "files-request-dialog", "files-link-step-dialog"]) expect(html).toContain(`data-testid="${id}"`);
=======
      for (const id of ["files-view", "files-list-card", "files-side", "files-breadcrumb", "files-drop-zone", "files-file-states", "files-upload-progress", "files-folder-panel", "files-upload-menu", "files-source-popover", "files-folder-picker", "files-row-menu", "files-delete-dialog", "files-request-dialog"]) expect(html).toContain(`data-testid="${id}"`);
>>>>>>> orch/fil-a2
      expect(html).toContain(createT(locale)("projectFiles.pageLabel"));
    }
  });

  it("FIL scaffold: every FIL string exists in German and English with the same placeholders", () => {
    const { en, de } = projectFiles;
    expect(Object.keys(de).sort()).toEqual(Object.keys(en).sort());
    const params = (s: string) => [...s.matchAll(/\{(\w+)\}/g)].map((m) => m[1]).sort();
    for (const key of Object.keys(en) as (keyof typeof en)[]) {
      expect(en[key].length, key).toBeGreaterThan(0);
      expect(de[key].length, key).toBeGreaterThan(0);
      expect(params(de[key]), key).toEqual(params(en[key]));
    }
  });
});
