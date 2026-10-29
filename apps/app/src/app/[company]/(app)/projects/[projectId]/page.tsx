// One project: board, team, baseline, measure checks, reward, links, comments and its timeline.
// The company's Jira state is read here, on the server, as the plain JiraStatusView (no secrets);
// the static demo and a missing database give null and the page then shows Jira as off or simulated.
import { ProjectView } from "@/components/projects/ProjectView";
import { jiraStatusView } from "@/features/integrations/jira/view";
import type { JiraStatusView } from "@/features/integrations/jira/types";
import { hasDatabase } from "@/lib/db/client";
import { findCompanyBySlug } from "@/lib/db/companies";
import { getIntegration, JIRA } from "@/lib/db/integrations";
export const metadata = { title: "Project" };

async function jiraOf(slug: string | undefined): Promise<JiraStatusView | null> {
  if (!slug || !hasDatabase()) return null;
  try {
    const company = await findCompanyBySlug(slug);
    return company ? jiraStatusView(await getIntegration(company.id, JIRA)) : null;
  } catch {
    // The project page works without Jira's state; it then shows the plain link row.
    return null;
  }
}

export default async function ProjectPage({ params }: { params: Promise<{ company?: string; projectId: string }> }) {
  const { company, projectId } = await params;
  return <ProjectView key={projectId} projectId={projectId} jira={await jiraOf(company)} />;
}
