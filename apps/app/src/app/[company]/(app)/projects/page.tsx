// Shared view. Projects and the Overview on one page; this is the Projects tab (docs/plans/2026-10-15_idea-to-project.md §3).
import { ProjectsHub } from "@/components/projects/ProjectsHub";
export const metadata = { title: "Projects" };
export default function ProjectsPage() {
  return <ProjectsHub tab="projects" />;
}
