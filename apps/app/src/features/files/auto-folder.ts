// Every idea gets its own SharePoint folder when it is raised, and its project links that same folder at the yes, so nobody
// links one by hand. The folder job (server/files/auto-folder.ts) makes them as NextUp's own app; this file decides what it
// makes and what the folders are called. Pure.
import type { ReducedProject } from "@/features/projects/types";
import { projectFolder } from "./link";

export { FOLDER_ACTOR, byFolderJob } from "./folder-actor";

const NAME_MAX = 80;

/**
 * A title as a SharePoint folder name: no " * : < > ? / \ | # % ~ & { }, no control characters, no leading or trailing dots
 * and spaces, at most 80 characters, never empty and never a name SharePoint reserves.
 */
export function folderName(title: string, fallback = "Idea"): string {
  const clean = (title ?? "")
    .replace(/[\u0000-\u001f"*:<>?/\\|#%~&{}]/g, " ")
    .replace(/\s+/g, " ")
    .trim()
    .slice(0, NAME_MAX)
    .replace(/^[\s.]+|[\s.]+$/g, "");
  if (!clean || /^(con|prn|aux|nul|com\d|lpt\d|_vti_|forms|desktop\.ini)$/i.test(clean)) return fallback;
  return clean;
}

type CaseLike = { id: string; title: string; folder: string | null; withdrawn: unknown; merged: unknown };
type ProjectLike = Pick<ReducedProject, "id" | "title" | "links" | "sources">;

/** One thing the job does: make a folder for an idea, or link a project to a folder (its idea's, or a new one when url is null). */
export type FolderTask =
  | { kind: "idea"; caseId: string; title: string }
  | { kind: "project"; projectId: string; title: string; url: string | null };

/**
 * What still needs a folder, among the ideas people raised (`raised`, case ids) and the projects their yes opened (`opened`,
 * project ids). An idea without a folder gets one unless it was withdrawn or merged. A project without a SharePoint folder
 * links its first idea's folder; when that idea is still waiting for its own in this round, the project waits for the next
 * one; when the idea will never get one (withdrawn, merged, not found), the project gets a folder of its own.
 */
export function folderTasks(state: { cases: CaseLike[]; projects: ProjectLike[] }, raised: Iterable<string>, opened: Iterable<string>): FolderTask[] {
  const cases = new Map(state.cases.map((c) => [c.id, c]));
  const projects = new Map(state.projects.map((p) => [p.id, p]));
  const out: FolderTask[] = [];
  const ideas = new Set<string>();
  for (const id of raised) {
    const c = cases.get(id);
    if (!c || c.folder || c.withdrawn || c.merged || ideas.has(id)) continue;
    ideas.add(id);
    out.push({ kind: "idea", caseId: c.id, title: c.title });
  }
  const done = new Set<string>();
  for (const id of opened) {
    const p = projects.get(id);
    if (!p || projectFolder(p) || done.has(id)) continue;
    done.add(id);
    const from = p.sources.map((s) => cases.get(s)).find((c) => c !== undefined);
    if (from && !from.folder && ideas.has(from.id)) continue;
    out.push({ kind: "project", projectId: p.id, title: p.title, url: from?.folder ?? null });
  }
  return out;
}
