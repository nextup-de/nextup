import { createElement as h } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { beforeEach, expect, it, vi } from "vitest";
import type { FileRow } from "@/features/files/items";
import type { ReducedProject, Step } from "@/features/projects/types";
import { createT } from "@/i18n";
import { I18nProvider } from "@/i18n/client";

const mocks = vi.hoisted(() => ({ sent: [] as unknown[], linked: [] as unknown[][] }));
vi.mock("@/components/dashboard/DemoProvider", () => ({
  useDemo: () => ({ S: { day: 10 }, serverMode: false, seed: { seats: [] }, act: { project: { link: (...args: unknown[]) => mocks.linked.push(args) } } }),
}));
vi.mock("@/components/projects/parts", () => ({
  teamOf: () => [{ userId: "u1", name: "L. Brandt" }, { userId: "u2", name: "S. Tran" }],
  useSend: () => (type: string, payload: unknown, go: () => void) => { mocks.sent.push([type, payload]); go(); return true; },
}));
vi.mock("@/server/actions/project-files", () => ({
  fileVersionsAction: async () => ({ state: "ok", versions: [] }),
  projectFolderAction: async () => ({ state: "empty" }),
}));

const { FolderPanel, InsideStrip } = await import("@/components/projects/files/FolderPanel");
const { FilePanel, officeLink } = await import("@/components/projects/files/FilePanel");
const { HistoryPanel } = await import("@/components/projects/files/HistoryPanel");
const { LinkStepDialog, appendLink, linkEvent, stepChoices } = await import("@/components/projects/files/LinkStepDialog");

const t = createT("en");
const row = (name: string, patch: Partial<FileRow> = {}): FileRow => ({
  id: name, name, kind: "sheet", ext: "xlsx", size: 245_760, isFolder: false, childCount: 0, modifiedBy: "L. Brandt", modifiedAt: "2026-11-10T14:02:00Z",
  createdBy: "S. Tran", createdAt: "2026-10-02T09:00:00Z", webUrl: "https://tenant.sharepoint.com/sites/p/" + name, parentPath: "Supplier data", ...patch,
});
const step = (id: string, text: string, patch: Partial<Step> = {}): Step => ({
  id, text, owner: null, dueDay: null, column: "doing", why: "", note: "", addedDay: 0, movedDay: 0, by: "Lead", startedDay: null, doneDay: null,
  external: { system: "jira", key: "KAN-" + id }, checklist: [], comments: [], waitingOn: null, ...patch,
});
const file = row("stock-levels-tier1.xlsx");
const folder = row("Delivery reports Q3", { kind: "folder", isFolder: true, ext: "", childCount: 8, size: 14_680_064 });
const p = {
  id: "pj2", steps: [step("13", "Set alert thresholds per line", { dueDay: 5 }), step("17", "Test the SMS gateway with stock suppliers")],
  links: [{ system: "sharepoint", url: file.webUrl, key: "KAN-13", stepId: "13", day: 1 }],
} as unknown as ReducedProject;
const actions = { open: vi.fn(), goTo: vi.fn(), select: vi.fn(), setView: vi.fn(), setQuery: vi.fn(), setFilter: vi.fn(), setSort: vi.fn(), showMore: vi.fn(), reload: vi.fn(), openDialog: vi.fn(), closeDialog: vi.fn() };
const base = { p, folder: { system: "sharepoint", url: "https://tenant.sharepoint.com/sites/p/Supplier data", key: "Supplier data", stepId: null, day: 0 }, path: ["Supplier data"], answer: "loading" as const, loaded: [file, row("brose-sla-2026.pdf", { kind: "pdf", ext: "pdf", size: 1_258_291 })], rows: [], next: null, selected: null, view: "list" as const, query: "", filter: "all" as const, sort: { field: "name" as const, direction: "asc" as const }, dialog: null, busy: false, editor: true };
const render = (node: React.ReactNode, locale: "en" | "de" = "en") => renderToStaticMarkup(h(I18nProvider, { locale, children: node }));
const part = (patch: Record<string, unknown> = {}) => ({ state: { ...base, ...patch } as typeof base, actions });

beforeEach(() => { mocks.sent.length = 0; mocks.linked.length = 0; });

it("FIL panels: with nothing selected the folder panel describes the open folder with + Upload here", () => {
  const html = render(h(FolderPanel, part()));
  expect(html).toContain("Supplier data");
  expect(html).toContain(t("projectFiles.folderThis", { count: 2, size: "1.4 MB" }));
  expect(html).toContain(t("projectFiles.uploadHere"));
  expect(html).not.toContain(t("projectFiles.openFolder"));
  expect(html).toContain(t("projectFiles.requestFiles"));
  expect(html).toContain(t("projectFiles.access"));
  expect(render(h(FolderPanel, part({ editor: false })))).not.toContain(t("projectFiles.uploadHere"));
});

it("FIL panels: a selected folder shows Open folder, and the Inside strip shows the files and +N", () => {
  const html = render(h(FolderPanel, part({ selected: folder })));
  expect(html).toContain("Delivery reports Q3");
  expect(html).toContain(t("projectFiles.folderMeta", { count: 8, size: "14 MB" }));
  expect(html).toContain(t("projectFiles.openFolder"));
  expect(html).not.toContain(t("projectFiles.uploadHere"));
  const strip = render(h(InsideStrip, { rows: [file, row("a.pdf", { kind: "pdf" }), row("b.docx", { kind: "doc" })], more: 5, onSelect: vi.fn(), onMore: vi.fn() }));
  expect(strip).toContain(t("projectFiles.inside"));
  expect(strip).toContain(t("projectFiles.moreInside", { count: 5 }));
  expect(strip).toContain('title="stock-levels-tier1.xlsx"');
});

it("FIL panels: a selected file shows its preview, Open in Excel, In browser, Download, Copy link, Changed, Linked to and Version", () => {
  const html = render(h(FilePanel, part({ selected: file })));
  expect(html).toContain("stock-levels-tier1.xlsx");
  expect(html).toContain(`${t("projectFiles.openInApp", { app: "Excel" })} ↗`);
  expect(html).toContain(`href="ms-excel:ofe|u|${file.webUrl}"`);
  for (const key of ["inBrowser", "download", "changed", "linkedSteps", "linkToStep"] as const) expect(html).toContain(t(`projectFiles.${key}`));
  expect(html).toContain(t("projectFiles.copyLink"));
  expect(html).toContain("KAN-13");
  expect(html).toContain(t("projectFiles.late"));
  expect(html).toContain("L. Brandt");
  expect(html).toContain(t("projectFiles.history"));
  expect(officeLink(row("a.pdf", { kind: "pdf" }))).toBeNull();
  // A PDF is opened in the browser; a viewer who may not change files has no Link to step.
  expect(render(h(FilePanel, part({ selected: row("a.pdf", { kind: "pdf" }) })))).toContain(`${t("projectFiles.openInBrowser")} ↗`);
  expect(render(h(FilePanel, part({ selected: file, editor: false })))).not.toContain(t("projectFiles.linkToStep"));
  expect(render(h(FilePanel, part({ selected: file })), "de")).toContain("In Excel öffnen");
});

it("FIL panels: Show history replaces the file panel with the history panel", () => {
  const history = { kind: "history" as const, row: file };
  expect(render(h(FilePanel, part({ selected: file, dialog: history })))).toBe("");
  expect(render(h(HistoryPanel, part()))).toBe("");
  const html = render(h(HistoryPanel, part({ selected: file, dialog: history })));
  expect(html).toContain(t("projectFiles.history"));
  expect(html).toContain("‹ stock-levels-tier1.xlsx");
  expect(html).toContain(t("projectFiles.historyHint"));
  expect(html).toContain(`${t("projectFiles.openHistory")} ↗`);
});

it("FIL panels: Link to step appends project.linked with the step, the file's address and the system sharepoint", () => {
  const { suggested, others } = stepChoices(p, row("supplier-stock.xlsx"));
  expect(suggested.map((s) => s.id)).toEqual(["17"]);
  expect(others.map((s) => s.id)).toEqual(["13"]);
  // A step the file is linked to already is not offered again.
  expect(stepChoices(p, file).others.map((s) => s.id).concat(stepChoices(p, file).suggested.map((s) => s.id))).toEqual(["17"]);
  expect(linkEvent(file, p.steps[1])).toEqual({ url: file.webUrl, system: "sharepoint", key: "KAN-17", stepId: "17" });
  const send = (type: string, payload: unknown, go: () => void) => { mocks.sent.push([type, payload]); go(); return true; };
  expect(appendLink(send, (...args) => mocks.linked.push(args), "pj2", file, p.steps[1])).toBe(true);
  expect(mocks.sent).toEqual([["project.linked", { url: file.webUrl, system: "sharepoint", key: "KAN-17", stepId: "17" }]]);
  expect(mocks.linked).toEqual([["pj2", file.webUrl, "sharepoint", "KAN-17", "17"]]);
  const html = render(h(LinkStepDialog, part({ dialog: { kind: "link-step", row: file } })));
  expect(html).toContain(t("projectFiles.linkStepSearch"));
  expect(html).toContain("Test the SMS gateway with stock suppliers");
  expect(html).not.toContain("Set alert thresholds per line");
  expect(render(h(LinkStepDialog, part({ dialog: { kind: "link-step", row: file }, editor: false })))).toBe("");
  expect(render(h(LinkStepDialog, part()))).toBe("");
});
