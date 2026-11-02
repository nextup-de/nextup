// Routing review (the console, ITC/D3): every raise of the stack's own company, the route the router
// proposed, and whether people kept it. See features/admin/decisions.ts for the verdicts.
import { notFound, redirect } from "next/navigation";
import { isAdmin } from "@/server/actions/admin";
import { consoleCompany } from "@/server/console-guard";
import { decisionData } from "@/server/admin-insight";
import { adminBase } from "@/features/admin/nav";
import { summarise } from "@/features/admin/decisions";
import { DecisionLog } from "@/components/admin/DecisionLog";
import { getT } from "@/i18n/server";

export default async function DecisionsPage() {
  if (!(await isAdmin())) redirect(adminBase() + "/login");
  const guard = await consoleCompany();
  if (!guard) notFound();
  const { rows, routeNames } = await decisionData({ id: guard.companyId, slug: guard.slug });
  return <DecisionLog rows={rows} summary={summarise(rows)} routeNames={routeNames} exportHref={adminBase() + "/decisions/export"} t={await getT()} />;
}
