// Shared view. Every project this person may see, grouped by state (docs/plans/2026-10-15_idea-to-project.md §3).
import { ProjectsView } from "@/components/projects/ProjectsView";
export const metadata = { title: "Projects" };
export default function ProjectsPage() {
  return <ProjectsView />;
}
