// One case, seen from three sides. History timeline from the event log.
import { CaseDetailView } from "@/components/dashboard/shared/CaseDetailView";
export default async function CaseDetailPage({ params }: { params: Promise<{ caseId: string }> }) {
  const { caseId } = await params;
  return <CaseDetailView key={caseId} caseId={caseId} />;
}
