// Starting uploads from the page (plan FIL-B1): puts the picked or dropped files in the queue and moves them one after the other
// through the server actions, or into the demo tree in memory (D11). Calls `landed` once when a batch has finished.
import { addDemoFile } from "@/features/demo/files-demo";
import { cancelUploadAction, startUploadAction, uploadChunkAction, uploadSmallAction } from "@/server/actions/project-files-upload";
import { CHUNK_SIZE } from "./upload-limits";
import { runUpload, splitRelative, uploadQueue, type UploadSteps } from "./upload";

export type UploadContext = { projectId: string; path: string; demo: boolean; by: string; landed: () => void };
type Picked = File & { webkitRelativePath?: string };

const cancelled = new Set<number>();
/** Stops one file: between chunks a running upload notices, a waiting one never starts. */
export function cancelUpload(id: number): void {
  cancelled.add(id);
  const item = uploadQueue.snapshot().find((i) => i.id === id);
  if (item?.state === "waiting") uploadQueue.update(id, { state: "cancelled" });
}

const steps = (ctx: UploadContext): UploadSteps => ({
  chunkSize: CHUNK_SIZE,
  small: (path, name, file) => { const form = new FormData(); form.set("name", name); form.set("file", file); return uploadSmallAction(ctx.projectId, path, form); },
  start: (path, name) => startUploadAction(ctx.projectId, path, name),
  chunk: (uploadUrl, start, total, chunk) => { const form = new FormData(); form.set("uploadUrl", uploadUrl); form.set("start", String(start)); form.set("total", String(total)); form.set("chunk", chunk); return uploadChunkAction(ctx.projectId, form); },
  cancel: (uploadUrl) => cancelUploadAction(ctx.projectId, uploadUrl),
});

/** Queue the files (a folder pick keeps its subfolders in `webkitRelativePath`) and upload them one after the other. */
export async function startUploads(files: readonly Picked[], ctx: UploadContext): Promise<void> {
  const queued: { id: number; file: Picked }[] = [];
  for (const file of files) {
    const target = splitRelative(ctx.path, file.webkitRelativePath ?? "", file.name);
    if (target) queued.push({ id: uploadQueue.add({ name: target.name, path: target.path, size: file.size }), file });
  }
  let any = false;
  for (const { id, file } of queued) {
    if (cancelled.has(id)) continue;
    const item = uploadQueue.snapshot().find((i) => i.id === id);
    if (!item) continue;
    if (ctx.demo) {
      uploadQueue.update(id, { state: "uploading" });
      addDemoFile(item.path, { name: item.name, size: file.size, by: ctx.by });
      uploadQueue.update(id, { state: "done", sent: file.size });
      any = true;
      continue;
    }
    if ((await runUpload(uploadQueue, id, file, steps(ctx), () => cancelled.has(id))) === "done") any = true;
  }
  if (any) ctx.landed();
}
