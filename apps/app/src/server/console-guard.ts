// The one door of the company's IT and privacy console (ITC/D4). Every console page and every console
// action calls consoleCompany() first: a page then answers notFound(), an action { ok: false, code:
// "not-allowed" }. A write names the company id from here, never from a form.
//
// Server only. It answers for the stack's own company (TENANT_MODE single, COMPANY_SLUG set) and for
// nobody else: in multi-tenant mode there is no console, and every /admin path is a 404.
import { cookies } from "next/headers";
import { ADMIN_COOKIE } from "@/features/auth/cookie";
import { getDb, hasDatabase } from "@/lib/db/client";
import { singleCompany } from "@/features/tenant/urls";
import type { AdminVia } from "@/features/auth/cookie";
import { grantActive } from "@/features/admin/support-code";
import { isAdmin } from "@/server/actions/admin";
import { adminWayIn, breakGlassOpenedAt, supportGrantId } from "@/server/admin-session";
import { windowOpen } from "@/features/admin/break-glass";
import { readBreakGlassWindow } from "@/server/break-glass-window";
import { loadAssistSettings } from "@/lib/db/assist";
import { jiraNavFacts } from "@/server/jira-admin";
import { AI_SYSTEM, aiSettings } from "@/features/ai/settings";
import { m365SearchOn } from "@/lib/db/connections";
import { getIntegration } from "@/lib/db/integrations";

/** How the viewer came in. */
export type ConsoleVia = AdminVia | "support";

/** `supportUntil` is set for a support session only: when its grant ends. */
export type ConsoleCompany = { companyId: string; slug: string; via: ConsoleVia; supportUntil?: Date };

/** Drops the admin cookie. A page render may not write cookies; the refusal stands either way. */
async function clearAdminCookie(): Promise<void> {
  try {
    (await cookies()).delete(ADMIN_COOKIE);
  } catch {
    /* read-only context */
  }
}

export async function consoleCompany(): Promise<ConsoleCompany | null> {
  if (singleCompany() === null || !hasDatabase()) return null;
  const slug = process.env.COMPANY_SLUG?.trim();
  if (!slug) return null;
  if (!(await isAdmin())) return null;
  const via = await adminWayIn();
  if (!via) return null;
  const company = await getDb().company.findUnique({ where: { slug }, select: { id: true, slug: true, stage: true } });
  if (!company) return null;
  // On a real stage a break-glass session lives only as long as the customer's window: closed,
  // expired or replaced (another openedAt) ends it. A demo company's shared-code session is as before.
  if (via === "break-glass" && company.stage !== "demo") {
    const window = await readBreakGlassWindow();
    if (!windowOpen(window, new Date()) || (await breakGlassOpenedAt()) !== window.openedAt.toISOString()) {
      await clearAdminCookie();
      return null;
    }
  }
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
  /** The company's open support grant and when it ends; null when none is open. */
  support: { until: Date } | null;
  /** Which connectors are on: Jira, live Microsoft 365 search, an AI provider. */
  connectors: { jira: boolean; m365: boolean; ai: boolean };
  /** How the viewer came in (the cookie); null when it cannot be read. */
  via: ConsoleVia | null;
};

export async function consoleOverviewFacts(companyId: string): Promise<ConsoleOverviewFacts> {
  const db = getDb();
  const [admins, company, jira, assist, grants, m365, aiRow, via] = await Promise.all([
    db.user.count({ where: { companyId, isStackAdmin: true, active: true } }),
    db.company.findUnique({ where: { id: companyId }, select: { entraTenantId: true, stage: true } }),
    jiraNavFacts(companyId).catch(() => null),
    loadAssistSettings(companyId).catch(() => null),
    db.supportGrant.findMany({ where: { companyId, revokedAt: null }, orderBy: { expiresAt: "desc" } }),
    m365SearchOn(companyId).catch(() => false),
    getIntegration(companyId, AI_SYSTEM).catch(() => null),
    adminWayIn().catch(() => null),
  ]);
  const now = new Date();
  const open = grants.find((g) => grantActive(g, now));
  // The demo stage's mock model is no connection to anything.
  const choice = aiSettings(aiRow ? { on: aiRow.on, settings: aiRow.settings } : null, process.env, company?.stage ?? "demo").choice;
  const ai = choice !== "off" && choice !== "mock";
  const jiraOn = Boolean(jira?.on);
  return {
    admins,
    entra: Boolean(company?.entraTenantId),
    jira: jiraOn,
    assistant: Boolean(assist?.enabled),
    support: open ? { until: open.expiresAt } : null,
    connectors: { jira: jiraOn, m365, ai },
    via,
  };
}
