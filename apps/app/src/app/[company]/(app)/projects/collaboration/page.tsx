// Shared view. Cross-team initiatives and members: ?id= selects an initiative. A tab of Projects.
import { CollaborationView } from "@/components/dashboard/shared/CollaborationView";
import { ProjectsTabs } from "@/components/projects/ProjectsTabs";
import { getT } from "@/i18n/server";
export async function generateMetadata() {
  return { title: (await getT())("shell.navCollaboration") };
}
export default async function CollaborationPage({ searchParams }: { searchParams: Promise<{ id?: string }> }) {
  const { id } = await searchParams;
  return (
    <>
      <ProjectsTabs active="collaboration" />
      <CollaborationView key={id ?? ""} initialId={id} />
    </>
  );
}
