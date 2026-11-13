// One case, seen from three sides. History timeline from the event log.
import { notFound } from "next/navigation";
import { getViewerFor } from "@/features/auth/session";
import { hasDatabase, orDemo } from "@/lib/db/client";
import { raiserIsInactive } from "@/lib/db/raiser-active";
import { mayOpen } from "@/lib/db/viewer-log";
import { LoadCase } from "@/components/dashboard/DemoProvider";
import { CasePlanPanel } from "@/components/agent/CasePlanPanel";
import { CaseDetailView } from "@/components/dashboard/shared/CaseDetailView";

export default async function CaseDetailPage({ params }: { params: Promise<{ company: string; caseId: string }> }) {
  const { company, caseId } = await params;
  // A case the viewer may not open is a 404, whether or not it is in the shipped log (VIS/D9).
  // The server says whether the person who raised it by name has left (D20); the browser's state does not know who is active.
  let raiserInactive = false;
  if (hasDatabase()) {
    const viewer = await getViewerFor(company);
    if (viewer) {
      const may = await orDemo(() => mayOpen(viewer.companyId, { userId: viewer.userId, role: viewer.role }, caseId), () => null);
      if (may === false) notFound();
      raiserInactive = await orDemo(() => raiserIsInactive(viewer.companyId, caseId), () => false);
    }
  }
  return (
    <LoadCase caseId={caseId}>
      <CaseDetailView key={caseId} caseId={caseId} raiserInactive={raiserInactive} />
      <CasePlanPanel caseId={caseId} />
    </LoadCase>
  );
}
