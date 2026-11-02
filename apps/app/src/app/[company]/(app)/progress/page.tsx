// Shared view. Movement since baseline: funnel, outcomes, stalled, answered.
import { ProgressView } from "@/components/dashboard/shared/ProgressView";
import { getT } from "@/i18n/server";
export async function generateMetadata() {
  return { title: (await getT())("shell.navProgress") };
}
export default function ProgressPage() {
  return <ProgressView />;
}
