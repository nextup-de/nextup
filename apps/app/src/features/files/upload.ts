// What uploading needs on the client and the server (plan FIL-B1): the rules for names and paths, the queue the page shows,
// and one runner that moves a file through the step functions it is given. Pure but for the queue's own state.
import { SMALL } from "./upload-limits";

export type UploadState = "waiting" | "uploading" | "done" | "failed" | "cancelled";
export type UploadItem = { id: number; name: string; path: string; size: number; sent: number; state: UploadState; error: string | null };

/** The window event the page header's '+ Upload' sends; the upload menu listens for it. */
export const FILES_UPLOAD_EVENT = "nextup:files-upload";

const ILLEGAL = /["*:<>?/\\|\u0000-\u001f]/g;
/** A file name SharePoint takes: no path separators, no illegal characters, not empty, at most 200 characters. */
export function safeName(name: string): string | null {
  const clean = name.replace(ILLEGAL, "_").trim().replace(/[. ]+$/, "").slice(0, 200);
  return clean && clean !== "." && clean !== ".." ? clean : null;
}
/** A folder path below the project's folder: plain segments only. The empty path is the folder itself. */
export function safePath(path: string): boolean {
  return typeof path === "string" && path.length <= 400 && !/[\\\u0000-\u001f]/.test(path) && path.split("/").every((s) => s !== ".." && s !== ".");
}
/** The folder part and the name of a file picked with 'Upload a folder' (webkitRelativePath "dir/sub/a.pdf"). */
export function splitRelative(base: string, relative: string, fallback: string): { path: string; name: string } | null {
  const parts = (relative || fallback).split("/").filter(Boolean);
  const name = safeName(parts.pop() ?? "");
  const dirs = parts.map(safeName);
  if (!name || dirs.some((d) => d === null)) return null;
  return { path: [base, ...dirs].filter(Boolean).join("/"), name };
}
export const isSmall = (size: number) => size <= SMALL;

/** The queue of the page: a small external store, so the menu, the drop zone and the progress rows share it. */
export function createUploadQueue() {
  let items: UploadItem[] = [];
  let next = 1;
  const listeners = new Set<() => void>();
  const emit = () => { items = [...items]; listeners.forEach((fn) => fn()); };
  return {
    subscribe: (fn: () => void) => { listeners.add(fn); return () => { listeners.delete(fn); }; },
    snapshot: () => items,
    add(entry: { name: string; path: string; size: number }): number {
      const id = next++;
      items.push({ id, ...entry, sent: 0, state: "waiting", error: null });
      emit();
      return id;
    },
    update(id: number, patch: Partial<Pick<UploadItem, "sent" | "state" | "error">>) {
      const item = items.find((i) => i.id === id);
      if (item) { Object.assign(item, patch); emit(); }
    },
    clearFinished() { items = items.filter((i) => i.state === "waiting" || i.state === "uploading"); emit(); },
  };
}
export const uploadQueue = createUploadQueue();
export type UploadQueue = ReturnType<typeof createUploadQueue>;

export type UploadSteps = {
  small: (path: string, name: string, file: Blob) => Promise<{ state: string }>;
  start: (path: string, name: string) => Promise<{ state: string; uploadUrl?: string }>;
  chunk: (uploadUrl: string, start: number, total: number, chunk: Blob) => Promise<{ state: string; next?: number }>;
  cancel: (uploadUrl: string) => Promise<void>;
  /** The chunk size the server takes; a multiple of 320 KiB. */
  chunkSize: number;
};

/** Moves one queued file through the steps; the queue shows its progress; `cancelled()` is asked between chunks. Never throws. */
export async function runUpload(queue: UploadQueue, id: number, file: Blob, steps: UploadSteps, cancelled: () => boolean): Promise<UploadState> {
  const item = queue.snapshot().find((i) => i.id === id);
  if (!item) return "failed";
  const finish = (state: UploadState, error: string | null = null) => { queue.update(id, { state, error }); return state; };
  try {
    queue.update(id, { state: "uploading" });
    if (isSmall(file.size)) {
      const answer = await steps.small(item.path, item.name, file);
      if (answer.state === "ok") { queue.update(id, { sent: file.size }); return finish("done"); }
      return finish("failed", answer.state);
    }
    const session = await steps.start(item.path, item.name);
    if (session.state !== "ok" || !session.uploadUrl) return finish("failed", session.state);
    for (let start = 0; start < file.size; start += steps.chunkSize) {
      if (cancelled()) { await steps.cancel(session.uploadUrl); return finish("cancelled"); }
      const end = Math.min(start + steps.chunkSize, file.size);
      const answer = await steps.chunk(session.uploadUrl, start, file.size, file.slice(start, end));
      if (answer.state === "ok") { queue.update(id, { sent: file.size }); return finish("done"); }
      if (answer.state !== "more") { await steps.cancel(session.uploadUrl); return finish("failed", answer.state); }
      queue.update(id, { sent: end });
    }
    return finish("failed", "offline");
  } catch {
    return finish("failed", "offline");
  }
}

export const uploadText = {
  en: {
    connectAgain: "Connect again to upload",
    connectAgainHint: "Your Microsoft sign-in only lets NextUp read files.",
    profile: "Open your profile",
    sizeOf: "{sent} of {total}",
    uploadingLine: "Uploading · {sent} of {total}",
    waitingLine: "Waiting · {total}",
    failed: "Upload failed: {why}",
    why_offline: "SharePoint can't be reached",
    why_no_access: "SharePoint did not allow it",
    why_not_connected: "Microsoft 365 is not connected",
    why_read_only: "Your Microsoft sign-in only lets NextUp read files",
    uploaded_one: "Uploaded {count} file",
    uploaded_other: "Uploaded {count} files",
    dismiss: "Dismiss",
  },
  de: {
    connectAgain: "Zum Hochladen erneut verbinden",
    connectAgainHint: "Ihre Microsoft-Anmeldung erlaubt NextUp nur das Lesen von Dateien.",
    profile: "Profil öffnen",
    sizeOf: "{sent} von {total}",
    uploadingLine: "Wird hochgeladen · {sent} von {total}",
    waitingLine: "Wartet · {total}",
    failed: "Hochladen fehlgeschlagen: {why}",
    why_offline: "SharePoint ist nicht erreichbar",
    why_no_access: "SharePoint hat es nicht erlaubt",
    why_not_connected: "Microsoft 365 ist nicht verbunden",
    why_read_only: "Ihre Microsoft-Anmeldung erlaubt NextUp nur das Lesen von Dateien",
    uploaded_one: "{count} Datei hochgeladen",
    uploaded_other: "{count} Dateien hochgeladen",
    dismiss: "Schließen",
  },
} as const;
export type UploadKey = keyof typeof uploadText.en extends infer K ? (K extends `${infer B}_${"one" | "other"}` ? B : K) : never;
export function ut(locale: "en" | "de", key: UploadKey, params: Record<string, string | number> = {}): string {
  const table: Record<string, string> = uploadText[locale];
  const form = typeof params.count === "number" ? (new Intl.PluralRules(locale).select(params.count) === "one" ? "_one" : "_other") : "";
  return Object.entries(params).reduce((text, [name, value]) => text.replaceAll(`{${name}}`, String(value)), table[key + form] ?? table[key]);
}
