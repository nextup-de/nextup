// Shared view. Cross-team initiatives and members: ?id= selects an initiative.
import { CollaborationView } from "@/components/dashboard/shared/CollaborationView";
export const metadata = { title: "Collaboration" };
export default async function CollaborationPage({ searchParams }: { searchParams: Promise<{ id?: string }> }) {
  const { id } = await searchParams;
  return <CollaborationView key={id ?? ""} initialId={id} />;
}
