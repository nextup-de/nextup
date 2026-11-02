// The one door of the company's IT and privacy console (ITC/D4). Every console page and every console
// action calls consoleCompany() first: a page then answers notFound(), an action { ok: false, code:
// "not-allowed" }. A write names the company id from here, never from a form.
//
// Server only. It answers for the stack's own company (TENANT_MODE single, COMPANY_SLUG set) and for
// nobody else: in multi-tenant mode there is no console, and every /admin path is a 404.
import { getDb, hasDatabase } from "@/lib/db/client";
import type { AdminVia } from "@/features/auth/cookie";
import { adminScope } from "@/features/admin/nav";
import { isAdmin } from "@/server/actions/admin";
import { adminWayIn } from "@/server/admin-session";
import { loadAssistSettings } from "@/lib/db/assist";
import { jiraNavFacts } from "@/server/jira-admin";

/** How the viewer came in. ITC-F1 adds "support"; the union stays open for it. */
export type ConsoleVia = AdminVia | "support";

export type ConsoleCompany = { companyId: string; slug: string; via: ConsoleVia };

export async function consoleCompany(): Promise<ConsoleCompany | null> {
  if (adminScope() !== "company" || !hasDatabase()) return null;
  const slug = process.env.COMPANY_SLUG?.trim();
  if (!slug) return null;
  if (!(await isAdmin())) return null;
  const via = await adminWayIn();
  if (!via) return null;
  const company = await getDb().company.findUnique({ where: { slug }, select: { id: true, slug: true } });
  return company ? { companyId: company.id, slug: company.slug, via } : null;
}

/** What the console overview counts, read for one company id (the guard's). */
export type ConsoleOverviewFacts = {
  admins: number;
  entra: boolean;
  jira: boolean;
  assistant: boolean;
};

export async function consoleOverviewFacts(companyId: string): Promise<ConsoleOverviewFacts> {
  const db = getDb();
  const [admins, company, jira, assist] = await Promise.all([
    db.user.count({ where: { companyId, isStackAdmin: true, active: true } }),
    db.company.findUnique({ where: { id: companyId }, select: { entraTenantId: true } }),
    jiraNavFacts(companyId).catch(() => null),
    loadAssistSettings(companyId).catch(() => null),
  ]);
  return { admins, entra: Boolean(company?.entraTenantId), jira: Boolean(jira?.on), assistant: Boolean(assist?.enabled) };
}
