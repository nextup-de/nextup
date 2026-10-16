// The Overview, now the "Ideas" column of the Projects page (same page as /projects). Every problem and idea in the
// company: open since, on whose desk (and every desk before), stage, score.
import { ProjectsHub } from "@/components/projects/ProjectsHub";
export const metadata = { title: "Overview" };
export default function OverviewPage() {
  return <ProjectsHub tab="ideas" />;
}
