// The old address of an idea or problem. Each idea has one page, /idea?id=<id> (Kevin, 16 Nov 2026): a case the viewer may
// open moves on there; one they may not open is a 404, whether or not it is in the shipped log (VIS/D9). Links in mails,
// Teams and stored notices still point here, so this address stays.
import { notFound, redirect } from "next/navigation";
import { getViewerFor } from "@/features/auth/session";
import { companyPrefix } from "@/features/tenant/urls";
import { hasDatabase, orDemo } from "@/lib/db/client";
import { mayOpen } from "@/lib/db/viewer-log";

export default async function CaseDetailPage({ params }: { params: Promise<{ company: string; caseId: string }> }) {
  const { company, caseId } = await params;
  if (hasDatabase()) {
    const viewer = await getViewerFor(company);
    if (viewer) {
      const may = await orDemo(() => mayOpen(viewer.companyId, { userId: viewer.userId, role: viewer.role }, caseId), () => null);
      if (may === false) notFound();
    }
  }
  redirect(companyPrefix(company) + "/idea?id=" + encodeURIComponent(caseId));
}
