// A person of the made-up company (the profile links on the raise page and the dashboard).
import { notFound } from "next/navigation";
import { ProfileView } from "@/components/profile/ProfileView";
import { seedTemplate } from "@/features/demo";

export default async function DemoPersonPage({ params }: { params: Promise<{ name: string }> }) {
  const { name: encodedName } = await params;
  let name: string;
  try { name = decodeURIComponent(encodedName); } catch { notFound(); }
  const person = seedTemplate("demo").people.find((p) => p.name === name);
  if (!person) notFound();
  return <ProfileView target={{ name, role: person.role, dept: person.dept, email: null }} />;
}
