import { createElement as h } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { beforeEach, describe, expect, it, vi } from "vitest";
import type { FilesActions, FilesState } from "@/components/projects/files/types";
import { createUploadQueue, isSmall, runUpload, safeName, safePath, splitRelative, uploadQueue, ut, type UploadSteps } from "@/features/files/upload";
import { ACTION_BODY_LIMIT, CHUNK_SIZE, SMALL } from "@/features/files/upload-limits";
import type { ReducedProject } from "@/features/projects/types";
import { I18nProvider } from "@/i18n/client";

vi.mock("@/components/dashboard/DemoProvider", () => ({ useDemo: () => ({ serverMode: false, persona: { who: { name: "L. Brandt" } }, href: (p: string) => "/acme" + p }) }));
vi.mock("@/server/actions/project-files-upload", () => ({ uploadAccessAction: async () => ({ state: "ok" }), uploadSmallAction: async () => ({ state: "ok" }), startUploadAction: async () => ({ state: "ok" }), uploadChunkAction: async () => ({ state: "ok" }), cancelUploadAction: async () => undefined }));

import { startUploads } from "@/features/files/upload-run";
import { listDemoFolder, resetDemoFiles } from "@/features/demo/files-demo";
import { DropZone } from "@/components/projects/files/DropZone";
import { UploadMenu } from "@/components/projects/files/UploadMenu";
import { UploadProgress } from "@/components/projects/files/UploadProgress";

const p = { links: [{ system: "sharepoint", url: "https://acme.sharepoint.com/sites/purchasing/Shared%20Documents/Supplier%20data", key: "", stepId: null, day: 0 }] } as unknown as ReducedProject;
const noop = () => {};
const actions: FilesActions = { open: noop, goTo: noop, select: noop, setView: noop, setQuery: noop, setFilter: noop, setSort: noop, showMore: noop, reload: noop, openDialog: noop, closeDialog: noop };
const state = (patch: Partial<FilesState> = {}): FilesState => ({ p, folder: p.links[0], path: [], answer: "loading", loaded: [], rows: [], next: null, selected: null, view: "list", query: "", filter: "all", sort: { field: "name", direction: "asc" }, dialog: null, busy: false, editor: true, ...patch } as unknown as FilesState);
const render = (node: React.ReactNode, locale: "en" | "de" = "en") => renderToStaticMarkup(h(I18nProvider, { locale, children: node }));
const blob = (n: number) => ({ size: n, slice: (a: number, b: number) => ({ size: b - a }) }) as unknown as Blob;

describe("FIL upload", () => {
  it("FIL upload: names and paths keep a file inside the folder", () => {
    expect(safeName("Q3: report?.pdf")).toBe("Q3_ report_.pdf");
    expect(safeName("  ../x/y.pdf ")).toBe(".._x_y.pdf");
    expect(safeName("..")).toBeNull();
    expect(safeName("   ")).toBeNull();
    expect(safeName("a".repeat(300))!.length).toBe(200);
    expect(safePath("Sub/Folder")).toBe(true);
    expect(safePath("")).toBe(true);
    for (const bad of ["../x", "a/../b", "a\\b", "a/./b"]) expect(safePath(bad)).toBe(false);
    expect(splitRelative("Base", "docs/sub/a.pdf", "a.pdf")).toEqual({ path: "Base/docs/sub", name: "a.pdf" });
    expect(splitRelative("", "", "plain.pdf")).toEqual({ path: "", name: "plain.pdf" });
    expect(isSmall(SMALL)).toBe(true);
    expect(isSmall(SMALL + 1)).toBe(false);
  });

  it("FIL upload: a small file goes in one step, a big one through a session in chunks, and the queue shows the progress", async () => {
    const queue = createUploadQueue();
    const calls: string[] = [];
    const steps: UploadSteps = {
      chunkSize: CHUNK_SIZE,
      small: async () => { calls.push("small"); return { state: "ok" }; },
      start: async () => { calls.push("start"); return { state: "ok", uploadUrl: "https://acme.sharepoint.com/s" }; },
      chunk: async (_url, start, total, chunk) => { calls.push(`chunk ${start}`); return start + (chunk as { size: number }).size >= total ? { state: "ok" } : { state: "more", next: start + (chunk as { size: number }).size }; },
      cancel: async () => { calls.push("cancel"); },
    };
    const a = queue.add({ name: "a.pdf", path: "", size: 10 });
    expect(await runUpload(queue, a, blob(10), steps, () => false)).toBe("done");
    expect(calls).toEqual(["small"]);
    calls.length = 0;
    const total = CHUNK_SIZE * 2 + 5;
    const b = queue.add({ name: "b.bin", path: "", size: total });
    expect(queue.snapshot().find((i) => i.id === b)).toMatchObject({ state: "waiting", sent: 0 });
    expect(await runUpload(queue, b, blob(total), steps, () => false)).toBe("done");
    expect(calls).toEqual(["start", "chunk 0", `chunk ${CHUNK_SIZE}`, `chunk ${CHUNK_SIZE * 2}`]);
    expect(queue.snapshot().find((i) => i.id === b)).toMatchObject({ state: "done", sent: total });
  });

  it("FIL upload: a cancel between chunks stops the session, and a failure is kept on the row with its reason", async () => {
    const queue = createUploadQueue();
    const calls: string[] = [];
    const steps: UploadSteps = {
      chunkSize: CHUNK_SIZE,
      small: async () => ({ state: "no-access" }),
      start: async () => ({ state: "ok", uploadUrl: "https://acme.sharepoint.com/s" }),
      chunk: async (_u, start) => { calls.push(`chunk ${start}`); return { state: "more", next: start + CHUNK_SIZE }; },
      cancel: async () => { calls.push("cancel"); },
    };
    const big = queue.add({ name: "b.bin", path: "", size: CHUNK_SIZE * 3 });
    let stop = false;
    const done = runUpload(queue, big, blob(CHUNK_SIZE * 3), { ...steps, chunk: async (u, s, t, c) => { const r = await steps.chunk(u, s, t, c); stop = true; return r; } }, () => stop);
    expect(await done).toBe("cancelled");
    expect(calls).toEqual(["chunk 0", "cancel"]);
    const small = queue.add({ name: "a.pdf", path: "", size: 5 });
    expect(await runUpload(queue, small, blob(5), steps, () => false)).toBe("failed");
    expect(queue.snapshot().find((i) => i.id === small)).toMatchObject({ state: "failed", error: "no-access" });
    expect(await runUpload(queue, small, blob(5), { ...steps, small: async () => { throw new Error("boom"); } }, () => false)).toBe("failed");
    queue.clearFinished();
    expect(queue.snapshot()).toEqual([]);
  });

  it("FIL upload: the Upload button opens Files and Folder into the open folder, closed it shows only the inputs", () => {
    const closed = render(h(UploadMenu, { state: state(), actions }));
    expect(closed).toContain('data-testid="files-upload-menu"');
    expect(closed).not.toContain('role="menu"');
    expect(closed).toContain("webkitdirectory");
    const open = render(h(UploadMenu, { state: state({ dialog: { kind: "upload-menu" } }), actions }));
    expect(open).toContain("To Supplier data");
    expect(open).toContain("Upload files");
    expect(open).toContain("Upload a folder");
    expect(render(h(UploadMenu, { state: state({ dialog: { kind: "upload-menu" }, path: ["Delivery reports Q3"] }), actions }))).toContain("To Delivery reports Q3");
  });

  it("FIL upload: each upload shows its progress in the open folder, with Cancel, and a failure says why", () => {
    uploadQueue.clearFinished();
    const id = uploadQueue.add({ name: "line3-pilot-results.xlsx", path: "", size: 2_300_000 });
    uploadQueue.update(id, { state: "uploading", sent: 1_400_000 });
    const other = uploadQueue.add({ name: "elsewhere.pdf", path: "Sub", size: 1000 });
    const waiting = uploadQueue.add({ name: "schaeffler-contract-2027.pdf", path: "", size: 880_000 });
    const failed = uploadQueue.add({ name: "bad.pdf", path: "", size: 10 });
    uploadQueue.update(failed, { state: "failed", error: "offline" });
    const html = render(h(UploadProgress, { state: state(), actions }));
    expect(html).toContain("line3-pilot-results.xlsx");
    expect(html).toContain("Uploading · 1.4 MB of 2.3 MB");
    expect(html).toContain("Waiting · 880 KB");
    expect(html).toContain("Upload failed: SharePoint can&#x27;t be reached");
    expect(html).toContain("Cancel");
    expect(html).toContain("<progress");
    expect(html).not.toContain("elsewhere.pdf");
    void other; void waiting;
    uploadQueue.update(id, { state: "done" });
    expect(render(h(UploadProgress, { state: state(), actions }))).not.toContain("line3-pilot-results.xlsx");
    uploadQueue.clearFinished();
  });

  it("FIL upload: dropping files shows the drop zone only for people who may upload, and the read-only note exists in both languages", () => {
    expect(render(h(DropZone, { state: state(), actions }))).toContain('data-testid="files-drop-zone"');
    expect(ut("en", "connectAgain")).toBe("Connect again to upload");
    expect(ut("de", "connectAgain")).toBe("Zum Hochladen erneut verbinden");
    expect(ut("en", "uploaded", { count: 1 })).toBe("Uploaded 1 file");
    expect(ut("de", "uploaded", { count: 2 })).toBe("2 Dateien hochgeladen");
  });

  it("FIL upload: in demo mode the files land in the open folder in memory, a folder pick keeps its subfolder, and the page is told once", async () => {
    resetDemoFiles();
    const landed = vi.fn();
    const f1 = new File(["abc"], "Price list.pdf");
    const f2 = Object.assign(new File(["x"], "Q4.xlsx"), { webkitRelativePath: "Delivery reports Q3/Q4.xlsx" });
    await startUploads([f1, f2], { projectId: "p", path: "", demo: true, by: "L. Brandt", landed });
    const root = listDemoFolder("");
    expect(root.state === "ok" && root.rows.some((r) => r.name === "Price list.pdf" && r.modifiedBy === "L. Brandt")).toBe(true);
    const sub = listDemoFolder("Delivery reports Q3");
    expect(sub.state === "ok" && sub.rows.some((r) => r.name === "Q4.xlsx")).toBe(true);
    expect(landed).toHaveBeenCalledTimes(1);
    uploadQueue.clearFinished();
    resetDemoFiles();
  });

  it("FIL upload: no server action body passes the default 1 MB limit, a single PUT and a chunk included, with the form overhead counted", () => {
    const overhead = 64 * 1024; // the other form fields and the multipart framing, generously
    expect(SMALL + overhead).toBeLessThan(ACTION_BODY_LIMIT);
    expect(CHUNK_SIZE + overhead).toBeLessThan(ACTION_BODY_LIMIT);
    expect(CHUNK_SIZE % (320 * 1024)).toBe(0);
    expect(isSmall(SMALL)).toBe(true);
    expect(isSmall(SMALL + 1)).toBe(false);
  });
});
