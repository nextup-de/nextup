// The Overview, where the idea just published shows up. A row opens the case at its own address.
import { getT } from "@/i18n/server";
import { ProjectsHub } from "@/components/projects/ProjectsHub";
export async function generateMetadata() {
  return { title: (await getT())("demo.titleOverview") };
}
export default function DemoOverviewPage() {
  return <ProjectsHub tab="ideas" linkCases />;
}
