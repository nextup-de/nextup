"use server";
// One case outside the window (VIS/D9): the page asks for it, the server checks the viewer may open it.
import { logFromRows } from "@/features/cases/persist";
import type { CaseEvent } from "@/features/cases/events";
import type { SeedCase } from "@/features/demo/types";
import type { SeedProject } from "@/features/projects/types";
import { getViewerFor } from "@/features/auth/session";
import { loadCaseFor } from "@/lib/db/viewer-log";

export type CaseLogResult =
  | { ok: true; events: CaseEvent[]; seedCase: SeedCase | null; seedProjects: SeedProject[] }
  | { ok: false };

export async function loadCaseLog(slug: string, caseId: string): Promise<CaseLogResult> {
  if (typeof slug !== "string" || typeof caseId !== "string") return { ok: false };
  const viewer = await getViewerFor(slug);
  if (!viewer) return { ok: false };
  try {
    const got = await loadCaseFor(viewer.companyId, { userId: viewer.userId, role: viewer.role }, caseId);
    if (!got) return { ok: false };
    return { ok: true, events: logFromRows(got.events, 0).events, seedCase: got.seedCase, seedProjects: got.seedProjects };
  } catch {
    return { ok: false };
  }
}
