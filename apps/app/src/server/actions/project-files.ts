"use server";
// Reading a project's SharePoint folder for the page (plan FIL, D4, D6): as the signed-in person, through their own
// Microsoft token. The viewer must belong to the company and be allowed to read the project; anything else, and a
// path that tries to leave the folder, is no-access. Never throws.
import { getViewer } from "@/features/auth/session";
import { reduce } from "@/features/cases/reducer";
import { folderOf, projectFolder } from "@/features/files/link";
import type { FolderAnswer, VersionsAnswer } from "@/features/files/items";
import { hasDatabase } from "@/lib/db/client";
import { loadSeed } from "@/lib/db/companies";
import { loadLogFor, seedForViewer } from "@/lib/db/viewer-log";
import { listFolder, versionsOf } from "@/server/files/graph-files";

type Reader = { companyId: string; userId: string; shareId: string };

/** The viewer and the share id of the project's folder, or the answer to give instead. */
async function readerFor(projectId: string): Promise<Reader | "not-connected" | "no-access"> {
  try {
    if (typeof projectId !== "string" || !projectId || projectId.length > 64 || !hasDatabase()) return "no-access";
    const viewer = await getViewer();
    if (!viewer) return "no-access";
    const seed = await loadSeed(viewer.companySlug);
    if (!seed) return "no-access";
    const { log, caseIds, projectIds } = await loadLogFor(viewer.companyId, viewer, new Date(), seed);
    // Projected companies list what this viewer may read; an unprojected one shows its whole log to every member.
    if (projectIds && !projectIds.includes(projectId)) return "no-access";
    const state = reduce(caseIds && projectIds ? seedForViewer(seed, caseIds, projectIds) : seed, log);
    const project = state.projects.find((p) => p.id === projectId);
    if (!project) return "no-access";
    const link = projectFolder(project);
    const shareId = link ? folderOf(link.url) : null;
    return shareId ? { companyId: viewer.companyId, userId: viewer.userId, shareId } : "not-connected";
  } catch (err) {
    console.warn("[files] project read failed:", err instanceof Error ? err.name : "error");
    return "no-access";
  }
}

/** A path inside the folder: plain segments only, so a name can never climb out of the shared folder. */
const insideFolder = (path: string): boolean =>
  typeof path === "string" && path.length <= 400 && !/[\\\u0000-\u001f]/.test(path) && path.split("/").every((s) => s !== ".." && s !== ".");

export async function projectFolderAction(projectId: string, path: string, next?: string | null): Promise<FolderAnswer> {
  if (!insideFolder(path)) return { state: "no-access" };
  const reader = await readerFor(projectId);
  if (typeof reader === "string") return { state: reader };
  return listFolder(reader, reader.shareId, path, next);
}

export async function fileVersionsAction(projectId: string, itemId: string): Promise<VersionsAnswer> {
  const reader = await readerFor(projectId);
  if (typeof reader === "string") return { state: reader };
  return versionsOf(reader, reader.shareId, itemId);
}
