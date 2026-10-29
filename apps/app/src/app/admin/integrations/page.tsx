// Integrations (company admin only): Jira's connection, mapping and status for this company
// (docs/plans/2026-10-29_jira-in-app.md). The platform admin has no per-company settings page.
import { notFound, redirect } from "next/navigation";
import { isAdmin } from "@/server/actions/admin";
import { adminContext } from "@/server/admin-context";
import { adminBase } from "@/features/admin/nav";
import { jiraAdminView } from "@/server/jira-admin";
import { JiraAdmin } from "@/components/admin/JiraAdmin";
import { CompanyMissing } from "@/components/admin/CompanyOverview";
import styles from "../admin.module.css";

export default async function IntegrationsPage() {
  if (!(await isAdmin())) redirect(adminBase() + "/login");
  const ctx = await adminContext();
  if (ctx.scope !== "company") notFound();
  if (!ctx.company) return <CompanyMissing />;
  if (!ctx.live) {
    return (
      <section className={styles.card}>
        <h1>Integrations</h1>
        <p className="nh-hint">The settings and the token are stored in the database, which is not configured here.</p>
      </section>
    );
  }
  const view = await jiraAdminView(ctx.company);
  return <JiraAdmin view={view} />;
}
