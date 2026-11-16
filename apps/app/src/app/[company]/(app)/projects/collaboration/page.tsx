// Shared view. A tab of Projects: the projects you work on, requests to you and your unit, the projects run across
// units (components/projects/area/Collaboration). Without projects the old cross-team map stays (?id= selects one).
import { CollaborationView } from "@/components/dashboard/shared/CollaborationView";
import { Collaboration } from "@/components/projects/area/Collaboration";
import { ProjectsPage } from "@/components/projects/ProjectsTabs";
import { getT } from "@/i18n/server";
export async function generateMetadata() {
  return { title: (await getT())("shell.navCollaboration") };
}
export default async function CollaborationPage({ searchParams }: { searchParams: Promise<{ id?: string }> }) {
  const { id } = await searchParams;
  return (
    <ProjectsPage tab="collaboration" off={<CollaborationView key={id ?? ""} initialId={id} />}>
      <Collaboration />
    </ProjectsPage>
  );
}
