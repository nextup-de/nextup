// Shared view. Projects and the Overview on one page; this is the Projects tab (docs/plans/2026-10-15_idea-to-project.md §3).
import { ProjectsHub } from "@/components/projects/ProjectsHub";
import { getT } from "@/i18n/server";
export async function generateMetadata() {
  return { title: (await getT())("shell.navProjects") };
}
export default function ProjectsPage() {
  return <ProjectsHub tab="projects" />;
}
