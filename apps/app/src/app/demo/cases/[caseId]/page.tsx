// One case, as in the company app ("Open the case" after publishing).
import { CaseDetailView } from "@/components/dashboard/shared/CaseDetailView";
export default async function DemoCasePage({ params }: { params: Promise<{ caseId: string }> }) {
  const { caseId } = await params;
  return <CaseDetailView key={caseId} caseId={caseId} />;
}
