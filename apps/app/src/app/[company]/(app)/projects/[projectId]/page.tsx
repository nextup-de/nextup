// One project: board, team, baseline, measure checks, reward, links, comments and its timeline.
import { ProjectView } from "@/components/projects/ProjectView";
export const metadata = { title: "Project" };
export default async function ProjectPage({ params }: { params: Promise<{ projectId: string }> }) {
  const { projectId } = await params;
  return <ProjectView key={projectId} projectId={projectId} />;
}
