// Shared view. Movement since baseline: funnel, outcomes, stalled, answered. A tab of Projects.
import { ProgressView } from "@/components/dashboard/shared/ProgressView";
import { ProjectsTabs } from "@/components/projects/ProjectsTabs";
import { getT } from "@/i18n/server";
export async function generateMetadata() {
  return { title: (await getT())("shell.navProgress") };
}
export default function ProgressPage() {
  return (
    <>
      <ProjectsTabs active="progress" />
      <ProgressView />
    </>
  );
}
