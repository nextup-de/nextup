"use server";
// The Jira attachments of a project, for the Files tool's read-only group (plan JSY D15, D23). The person must belong to the company and
// read the project (loaded the way server/actions/project-files.ts loads it), the flag projectPages must be on, and only then are the
// connection, the project's sync and its links asked. Attachments are read with the company's integration account, not the viewer's own
// Jira identity: the viewer sees what the project's linked issues carry. Never throws.
import { getViewer } from "@/features/auth/session";
import { reduce } from "@/features/cases/reducer";
import { isEnabled } from "@/features/flags";
import type { AttachmentsAnswer } from "@/features/integrations/jira/types";
import { hasDatabase } from "@/lib/db/client";
import { loadSeed } from "@/lib/db/companies";
import { loadLogFor, seedForViewer } from "@/lib/db/viewer-log";
import { jiraConnFor, readAttachments } from "@/server/jira/attachments";

export async function projectAttachmentsAction(projectId: string): Promise<AttachmentsAnswer> {
  try {
    if (typeof projectId !== "string" || !projectId || projectId.length > 64 || !hasDatabase()) return { state: "no-access" };
    const viewer = await getViewer();
    if (!viewer) return { state: "no-access" };
    const seed = await loadSeed(viewer.companySlug);
    if (!seed) return { state: "no-access" };
    const { log, caseIds, projectIds } = await loadLogFor(viewer.companyId, viewer, new Date(), seed);
    if (projectIds && !projectIds.includes(projectId)) return { state: "no-access" };
    const state = reduce(caseIds && projectIds ? seedForViewer(seed, caseIds, projectIds) : seed, log);
    const project = state.projects.find((p) => p.id === projectId);
    if (!project) return { state: "no-access" };
    // The pages are behind the flag (PAGES HD15): with it off there is no Jira group to show.
    if (!(await isEnabled(viewer.companySlug, "projectPages"))) return { state: "not-connected" };
    return await readAttachments({ id: viewer.companyId }, project, await jiraConnFor(viewer.companyId));
  } catch (err) {
    console.warn("[jira] project attachments failed:", err instanceof Error ? err.name : "error");
    return { state: "offline" };
  }
}
