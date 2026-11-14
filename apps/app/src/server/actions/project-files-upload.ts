"use server";
// Uploading into a project's SharePoint folder (plan FIL-B1, D5): as the signed-in person, through their own Microsoft token.
// Every call re-checks the viewer: the company, the project, project.linked rights (who may change the folder's files) and a grant
// that can write. A path or name that would leave the folder is refused. Never throws.
import { meFor, type Actor } from "@/features/auth/identity";
import { getViewer } from "@/features/auth/session";
import { reduce } from "@/features/cases/reducer";
import type { FileRow } from "@/features/files/items";
import { folderOf, projectFolder } from "@/features/files/link";
import { safeName, safePath } from "@/features/files/upload";
import { mayAppendProject } from "@/features/projects/permissions";
import { getDb, hasDatabase } from "@/lib/db/client";
import { loadSeed } from "@/lib/db/companies";
import { loadLogFor, seedForViewer } from "@/lib/db/viewer-log";
import { CHUNK, SMALL_MAX, cancelSession, createSession, putChunk, uploadSmall } from "@/server/files/upload";

type Refusal = "not-connected" | "no-access" | "read-only" | "offline";
export type AccessAnswer = { state: "ok" } | { state: Refusal };
export type UploadResult = { state: "ok"; row: FileRow } | { state: Refusal };
export type SessionResult = { state: "ok"; uploadUrl: string } | { state: Refusal };
export type ChunkResult = { state: "more"; next: number } | { state: "ok"; row: FileRow } | { state: Refusal };

/** True when the person's grant can write files. TODO(FIL-P1): switch to canWriteFiles from features/m365/token once FIL-P1 merges. */
const mayWrite = (scopes: readonly string[]): boolean => scopes.some((scope) => /(^|\/)Files\.ReadWrite(\.All)?$/i.test(scope.trim()));

type Writer = { companyId: string; userId: string; shareId: string };

async function writerFor(projectId: string): Promise<Writer | Refusal> {
  try {
    if (typeof projectId !== "string" || !projectId || projectId.length > 64 || !hasDatabase()) return "no-access";
    const viewer = await getViewer();
    if (!viewer) return "no-access";
    const seed = await loadSeed(viewer.companySlug);
    if (!seed) return "no-access";
    const { log, caseIds, projectIds } = await loadLogFor(viewer.companyId, viewer, new Date(), seed);
    if (projectIds && !projectIds.includes(projectId)) return "no-access";
    const state = reduce(caseIds && projectIds ? seedForViewer(seed, caseIds, projectIds) : seed, log);
    const project = state.projects.find((p) => p.id === projectId);
    if (!project) return "no-access";
    const link = projectFolder(project);
    const shareId = link ? folderOf(link.url) : null;
    if (!link || !shareId) return "not-connected";
    const actor: Actor = { role: viewer.role as Actor["role"], userId: viewer.userId, me: meFor(viewer.userId, seed.seats), name: "", handle: null };
    if (!mayAppendProject(actor, { type: "project.linked", target: projectId, payload: { system: "sharepoint", url: link.url } }, state).ok) return "no-access";
    const connection = await getDb().connection.findFirst({ where: { companyId: viewer.companyId, userId: viewer.userId, provider: "m365" }, select: { scopes: true } });
    if (!connection) return "not-connected";
    if (!mayWrite(connection.scopes)) return "read-only";
    return { companyId: viewer.companyId, userId: viewer.userId, shareId };
  } catch (err) {
    console.warn("[files] upload check failed:", err instanceof Error ? err.name : "error");
    return "offline";
  }
}

/** What the Upload buttons ask when they open: may this person upload here at all? */
export async function uploadAccessAction(projectId: string): Promise<AccessAnswer> {
  const writer = await writerFor(projectId);
  return typeof writer === "string" ? { state: writer } : { state: "ok" };
}

/** A file of up to 800 KB in one PUT. `path` is the open folder below the project's folder; `form` carries `file` and `name`. */
export async function uploadSmallAction(projectId: string, path: string, form: FormData): Promise<UploadResult> {
  const name = safeName(String(form.get("name") ?? ""));
  const file = form.get("file");
  if (!name || !safePath(path) || !(file instanceof Blob) || file.size > SMALL_MAX) return { state: "no-access" };
  const writer = await writerFor(projectId);
  if (typeof writer === "string") return { state: writer };
  return uploadSmall(writer, writer.shareId, path, name, new Uint8Array(await file.arrayBuffer()));
}

/** The upload session of a big file. The client then sends the chunks and cancels with the URL it got here. */
export async function startUploadAction(projectId: string, path: string, name: string): Promise<SessionResult> {
  const clean = safeName(name);
  if (!clean || !safePath(path)) return { state: "no-access" };
  const writer = await writerFor(projectId);
  if (typeof writer === "string") return { state: writer };
  return createSession(writer, writer.shareId, path, clean);
}

/** One chunk of at most 640 KiB: `form` carries `uploadUrl`, `start`, `total` and `chunk`. */
export async function uploadChunkAction(projectId: string, form: FormData): Promise<ChunkResult> {
  const uploadUrl = String(form.get("uploadUrl") ?? "");
  const start = Number(form.get("start"));
  const total = Number(form.get("total"));
  const chunk = form.get("chunk");
  if (!(chunk instanceof Blob) || chunk.size > CHUNK || !Number.isInteger(start) || !Number.isInteger(total) || start < 0) return { state: "no-access" };
  const writer = await writerFor(projectId);
  if (typeof writer === "string") return { state: writer };
  return putChunk(uploadUrl, start, new Uint8Array(await chunk.arrayBuffer()), total);
}

export async function cancelUploadAction(projectId: string, uploadUrl: string): Promise<void> {
  const writer = await writerFor(projectId);
  if (typeof writer !== "string") await cancelSession(uploadUrl);
}
