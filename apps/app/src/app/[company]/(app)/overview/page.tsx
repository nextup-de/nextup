// The Overview, now the "Ideas" column of the Projects page (same page as /projects). Every problem and idea in the
// company: open since, on whose desk (and every desk before), stage, score.
import { ProjectsHub } from "@/components/projects/ProjectsHub";
import { getT } from "@/i18n/server";
export async function generateMetadata() {
  return { title: (await getT())("shell.navOverview") };
}
export default function OverviewPage() {
  return <ProjectsHub tab="ideas" />;
}
