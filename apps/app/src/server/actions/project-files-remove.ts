"use server";
// Deleting a file of a project's SharePoint folder (plan FIL-B2, D5, D8): as the signed-in person, through their own
// Microsoft token. The viewer must belong to the company, read the project, may append project.linked (D8) and hold a
// grant that can write. Never throws.
import { meFor, type Actor } from "@/features/auth/identity";
import { getViewer } from "@/features/auth/session";
import { reduce } from "@/features/cases/reducer";
import { folderOf, projectFolder } from "@/features/files/link";
import { mayAppendProject } from "@/features/projects/permissions";
import { getDb, hasDatabase } from "@/lib/db/client";
import { loadSeed } from "@/lib/db/companies";
import { loadLogFor, seedForViewer } from "@/lib/db/viewer-log";
import { removeItem } from "@/server/files/remove";

export type DeleteAnswer = { state: "ok" | "gone" | "not-connected" | "no-access" | "offline" | "read-only" };

/** True when the person's grant can write files. TODO(FIL-P1): switch to canWriteFiles from features/m365/token once FIL-P1 merges. */
const mayWrite = (scopes: readonly string[]): boolean => scopes.some((scope) => /(^|\/)Files\.ReadWrite(\.All)?$/i.test(scope.trim()));

export async function deleteFileAction(projectId: string, itemId: string): Promise<DeleteAnswer> {
  try {
    if (typeof projectId !== "string" || !projectId || projectId.length > 64 || typeof itemId !== "string" || !hasDatabase()) return { state: "no-access" };
    const viewer = await getViewer();
    if (!viewer) return { state: "no-access" };
    const seed = await loadSeed(viewer.companySlug);
    if (!seed) return { state: "no-access" };
    const { log, caseIds, projectIds } = await loadLogFor(viewer.companyId, viewer, new Date(), seed);
    if (projectIds && !projectIds.includes(projectId)) return { state: "no-access" };
    const state = reduce(caseIds && projectIds ? seedForViewer(seed, caseIds, projectIds) : seed, log);
    const project = state.projects.find((p) => p.id === projectId);
    if (!project) return { state: "no-access" };
    const link = projectFolder(project);
    const shareId = link ? folderOf(link.url) : null;
    if (!link || !shareId) return { state: "not-connected" };
    const actor: Actor = { role: viewer.role as Actor["role"], userId: viewer.userId, me: meFor(viewer.userId, seed.seats), name: "", handle: null };
    if (!mayAppendProject(actor, { type: "project.linked", target: projectId, payload: { system: "sharepoint", url: link.url } }, state).ok) return { state: "no-access" };
    const connection = await getDb().connection.findFirst({ where: { companyId: viewer.companyId, userId: viewer.userId, provider: "m365" }, select: { scopes: true } });
    if (!connection) return { state: "not-connected" };
    if (!mayWrite(connection.scopes)) return { state: "read-only" };
    return await removeItem({ companyId: viewer.companyId, userId: viewer.userId }, shareId, itemId);
  } catch (err) {
    console.warn("[files] delete check failed:", err instanceof Error ? err.name : "error");
    return { state: "offline" };
  }
}
