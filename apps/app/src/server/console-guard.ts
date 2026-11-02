// The one door of the company's IT and privacy console (ITC/D4). Every console page and every console
// action calls consoleCompany() first: a page then answers notFound(), an action { ok: false, code:
// "not-allowed" }. A write names the company id from here, never from a form.
//
// Server only. It answers for the stack's own company (TENANT_MODE single, COMPANY_SLUG set) and for
// nobody else: in multi-tenant mode there is no console, and every /admin path is a 404.
import { getDb, hasDatabase } from "@/lib/db/client";
import type { AdminVia } from "@/features/auth/cookie";
import { grantActive } from "@/features/admin/support-code";
import { adminScope } from "@/features/admin/nav";
import { isAdmin } from "@/server/actions/admin";
import { adminWayIn, supportGrantId } from "@/server/admin-session";
import { loadAssistSettings } from "@/lib/db/assist";
import { jiraNavFacts } from "@/server/jira-admin";

/** How the viewer came in. */
export type ConsoleVia = AdminVia | "support";

/** `supportUntil` is set for a support session only: when its grant ends. */
export type ConsoleCompany = { companyId: string; slug: string; via: ConsoleVia; supportUntil?: Date };

export async function consoleCompany(): Promise<ConsoleCompany | null> {
  if (adminScope() !== "company" || !hasDatabase()) return null;
  const slug = process.env.COMPANY_SLUG?.trim();
  if (!slug) return null;
  if (!(await isAdmin())) return null;
  const via = await adminWayIn();
  if (!via) return null;
  const company = await getDb().company.findUnique({ where: { slug }, select: { id: true, slug: true } });
  if (!company) return null;
  if (via !== "support") return { companyId: company.id, slug: company.slug, via };
  // A support session lives only as long as its grant: revoked, expired or replaced ends it.
  const id = await supportGrantId();
  const grant = id ? await getDb().supportGrant.findUnique({ where: { id } }) : null;
  if (!grant || grant.companyId !== company.id || !grantActive(grant, new Date())) return null;
  return { companyId: company.id, slug: company.slug, via, supportUntil: grant.expiresAt };
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
