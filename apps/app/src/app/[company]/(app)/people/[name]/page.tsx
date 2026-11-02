import { notFound } from "next/navigation";
import { ProfileView } from "@/components/profile/ProfileView";
import { findTenant } from "@/features/tenant";
import { seedFor } from "@/features/demo";
import { guardPage } from "@/server/page-guard";
import { getT } from "@/i18n/server";

export default async function PersonProfilePage({ params }: { params: Promise<{ company: string; name: string }> }) {
  const { company, name: encodedName } = await params;
  let name: string;
  try { name = decodeURIComponent(encodedName); } catch { notFound(); }
  const [tenant, seed] = await Promise.all([findTenant(company), seedFor(company)]);
  if (!tenant) notFound();
  await guardPage(tenant.slug, `/people/${encodedName}`);
  if (name.startsWith("Anonymous")) notFound();
  const t = await getT();
  const person = seed.people.find((p) => p.name === name);
  const user = tenant.users.find((u) => u.name === name);
  if ((!person && !user) || user?.handle) notFound();
  return <ProfileView target={{ name, role: person?.role ?? user?.role ?? t("shell.teamMember"), dept: person?.dept ?? user?.dept ?? "", email: user?.email ?? null }} />;
}
