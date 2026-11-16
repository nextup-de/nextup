// One idea or problem, open: /idea?id=<id>, the idea's one page (Kevin, 16 Nov 2026). The idea card, and under it the
// approval line, the moves and the history. An id the viewer may not open is a 404, as /cases/<id> was (VIS/D9); an idea
// not in the shipped log is loaded first. Without an id the view moves the address on (to the Inbox with projects on).
import { notFound } from "next/navigation";
import { LoadCase } from "@/components/dashboard/DemoProvider";
import { ProjectsHub } from "@/components/projects/ProjectsHub";
import { getViewerFor } from "@/features/auth/session";
import { getT } from "@/i18n/server";
import { hasDatabase, orDemo } from "@/lib/db/client";
import { raiserIsInactive } from "@/lib/db/raiser-active";
import { mayOpen } from "@/lib/db/viewer-log";
export async function generateMetadata() {
  return { title: (await getT())("projects.hubIdeas") };
}
type Props = { params: Promise<{ company?: string }>; searchParams: Promise<{ id?: string }> };
export default async function IdeaPage({ params, searchParams }: Props) {
  const [{ company }, { id }] = await Promise.all([params, searchParams]);
  // Whether the person who raised it by name has left (D20): the server knows, the browser's state does not.
  let raiserInactive = false;
  if (id && company && hasDatabase()) {
    const viewer = await getViewerFor(company);
    if (viewer) {
      const may = await orDemo(() => mayOpen(viewer.companyId, { userId: viewer.userId, role: viewer.role }, id), () => null);
      if (may === false) notFound();
      raiserInactive = await orDemo(() => raiserIsInactive(viewer.companyId, id), () => false);
    }
  }
  return id ? <LoadCase caseId={id}><ProjectsHub tab="ideas" raiserInactive={raiserInactive} /></LoadCase> : <ProjectsHub tab="ideas" />;
}
