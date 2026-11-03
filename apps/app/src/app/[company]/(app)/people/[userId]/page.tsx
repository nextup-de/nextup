import { notFound, redirect } from "next/navigation";
import { PersonView } from "@/components/people/PersonView";
import { getViewerFor } from "@/features/auth/session";
import { resolvePersonParam } from "@/features/people/resolve";
import { findTenant } from "@/features/tenant";
import { companyPrefix } from "@/features/tenant/urls";
import { hasDatabase } from "@/lib/db/client";
import { personCandidates, personPage } from "@/lib/db/people";
import { guardPage } from "@/server/page-guard";

// The minimal directory entry (MET D15): an opaque user id of an active person in this company.
// It needs a database and a session; names and handles are never looked up.
export default async function PersonPage({ params }: { params: Promise<{ company: string; userId: string }> }) {
  const { company, userId } = await params;
  const tenant = await findTenant(company);
  if (!tenant) notFound();
  await guardPage(tenant.slug, `/people/${encodeURIComponent(userId)}`);
  if (!hasDatabase()) notFound();
  const viewer = await getViewerFor(tenant.slug);
  if (!viewer) notFound();
  const route = resolvePersonParam(userId, await personCandidates(viewer.companyId, userId), viewer.userId);
  if (route.kind === "redirect") redirect(companyPrefix(tenant.slug) + "/profile");
  if (route.kind === "notFound") notFound();
  const person = await personPage(viewer.companyId, route.userId);
  if (!person) notFound();
  return <PersonView name={person.name} role={person.role} unitPath={person.unitPath} />;
}
