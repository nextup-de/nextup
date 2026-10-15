// The Overview, where the idea just published shows up. A row opens the case at its own address.
import { ProjectsHub } from "@/components/projects/ProjectsHub";
export const metadata = { title: "Overview" };
export default function DemoOverviewPage() {
  return <ProjectsHub tab="ideas" linkCases />;
}
