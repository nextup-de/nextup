// Decisions: every raise, the route the router proposed, and whether people kept it. The page the
// software team reads to improve routing - see features/admin/decisions.ts for the verdicts.
import { redirect } from "next/navigation";
import { isAdmin } from "@/server/actions/admin";
import { adminContext } from "@/server/admin-context";
import { decisionData } from "@/server/admin-insight";
import { adminBase } from "@/features/admin/nav";
import { summarise } from "@/features/admin/decisions";
import { DecisionLog } from "@/components/admin/DecisionLog";

export default async function DecisionsPage() {
  if (!(await isAdmin())) redirect(adminBase() + "/login");
  const ctx = await adminContext();
  const companies = ctx.live ? ctx.companies : [];
  const { rows, routeNames } = await decisionData(companies);
  return <DecisionLog rows={rows} summary={summarise(rows)} routeNames={routeNames} exportHref={adminBase() + "/decisions/export"} />;
}
