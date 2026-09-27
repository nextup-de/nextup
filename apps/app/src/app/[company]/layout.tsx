// Tenant scope. Resolves the company from the URL segment; unknown slug -> 404.
import { notFound } from "next/navigation";
import { findTenant } from "@/features/tenant";

export default async function CompanyLayout({ children, params }: { children: React.ReactNode; params: Promise<{ company: string }> }) {
  const { company } = await params;
  const tenant = await findTenant(company);
  if (!tenant) notFound();
  return <>{children}</>;
}
