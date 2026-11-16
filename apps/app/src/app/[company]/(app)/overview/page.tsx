// The old Overview: every problem and idea in the company, as a table. With projects on there is no ideas table any more
// (Kevin and Sam, 16 Nov 2026, docs/DESIGN_RULES.md §8): ideas are decided in the Inbox and followed under Ideas › Mine,
// so the address moves on to the Inbox. Without projects it is still the Overview in the bar.
import { redirect } from "next/navigation";
import { ProjectsHub } from "@/components/projects/ProjectsHub";
import { flagsFor } from "@/features/flags";
import { companyPrefix } from "@/features/tenant/urls";
import { getT } from "@/i18n/server";
export async function generateMetadata() {
  return { title: (await getT())("shell.navOverview") };
}
export default async function OverviewPage({ params }: { params: Promise<{ company: string }> }) {
  const { company } = await params;
  if ((await flagsFor(company)).projects) redirect(companyPrefix(company) + "/inbox");
  return <ProjectsHub tab="ideas" />;
}
