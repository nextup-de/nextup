// Tenant scope. Resolves the company from the URL segment; unknown slug -> 404.
import { notFound } from "next/navigation";
import { findTenant } from "@/features/tenant";
import { testAnalyticsFor } from "@/features/testing/analytics";
import { TestAnalytics } from "@/components/testing/TestAnalytics";

export default async function CompanyLayout({ children, params }: { children: React.ReactNode; params: Promise<{ company: string }> }) {
  const { company } = await params;
  const tenant = await findTenant(company);
  if (!tenant) notFound();
  // User tests on demo stacks only; null everywhere else, and then not even the component ships.
  const analytics = testAnalyticsFor(tenant.slug, tenant.stage, process.env.POSTHOG_KEY);
  return <>{children}{analytics && <TestAnalytics config={analytics} />}</>;
}
