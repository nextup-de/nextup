// Overview: the console's front page (ITC/D3) - who can get in and what is switched on.
// Every other detail lives on its own page. With TENANT_MODE multi consoleCompany() answers null and
// the page is a 404 (D4).
import { notFound, redirect } from "next/navigation";
import { isAdmin } from "@/server/actions/admin";
import { adminContext } from "@/server/admin-context";
import { adminBase } from "@/features/admin/nav";
import { CompanyMissing, ConsoleOverview } from "@/components/admin/CompanyOverview";
import { consoleCompany, consoleOverviewFacts } from "@/server/console-guard";
import { getT } from "@/i18n/server";

export default async function AdminOverview() {
  if (!(await isAdmin())) redirect(adminBase() + "/login");
  const guard = await consoleCompany();
  if (!guard) notFound();
  const ctx = await adminContext();
  if (!ctx.company) return <CompanyMissing />;
  const facts = await consoleOverviewFacts(guard.companyId);
  return <ConsoleOverview company={ctx.company} facts={facts} base={adminBase()} t={await getT()} />;
}
