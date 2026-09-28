// Everything the /admin pages read, loaded once per request.
//
// The layout needs it for the sidebar badges and every page needs a slice of it, so it is wrapped
// in React's cache(): the layout and the page share one read per request, not one each.
//
// databaseReport() goes first and alone - it settles whether Postgres is actually there. Asking it
// after the reads would mean a 500 for anyone whose database went away mid-request, which is the
// one moment /admin most needs to render.
//
// In a one-company stack (adminScope() === "company") only the company is read: pilot requests,
// notices, tasks and the mail relay belong to the platform admin on admin.sellux.ch.
import { cache } from "react";
import {
  automationReport,
  automationTasks,
  databaseReport,
  listCompanies,
  listPilotRequests,
} from "@/server/actions/admin";
import { demoCompanies, demoPilotRequests } from "@/features/admin/demo";
import { adminNav, adminScope, companyNav, lockedOut, type MailState } from "@/features/admin/nav";
import type { CompanyRow } from "@/features/admin/rows";
import { isOverdue } from "@/features/admin/requests";
import { countByState } from "@/features/integrations/tasks";
import { databaseOutage, hasDatabase } from "@/lib/db/client";
import { openTicketCount } from "@/lib/db/tickets";
import { mailStatus } from "@/server/mail";

export const adminContext = cache(async () => {
  const database = await databaseReport();
  const live = hasDatabase();
  const scope = adminScope();

  if (scope === "company") {
    const companies = live ? await listCompanies() : await demoCompanies();
    // The stack's database holds this one company; the slug check is belt and braces.
    const company = companies.find((c) => c.slug === process.env.COMPANY_SLUG?.trim()) ?? (live ? null : companies[0] ?? null);
    const nav = companyNav({ people: company?.persons.length ?? 0, locked: company ? lockedOut(company).length : 0 });
    return { scope, live, outage: databaseOutage(), database, company, companies: company ? [company] : [], nav, ...PLATFORM_EMPTY };
  }
  // The relay is checked once, here, and handed to the notices report rather than asked twice.
  const [companies, requests, automation, tasks, mail] = live
    ? await mailStatus().then((mail) =>
        Promise.all([listCompanies(), listPilotRequests(), automationReport(mail), automationTasks(), mail]),
      )
    : await Promise.all([demoCompanies(), demoPilotRequests(), null, [], mailStatus()]);

  const open = requests.filter((r) => !r.handledAt);
  const now = new Date();
  const overdue = open.filter((r) => isOverdue(r, now));
  const taskCounts = automation ? countByState(tasks) : null;
  const mailState: MailState = !mail.configured ? "off" : mail.reachable ? "up" : "down";
  const openTickets = live ? await openTicketCount(companies.map((c) => c.id)).catch(() => 0) : 0;

  const nav = adminNav({
    database: database.state,
    openRequests: open.length,
    overdueRequests: overdue.length,
    companies: companies.length,
    openTickets,
    automation: automation?.summary.state ?? null,
    tasks: taskCounts,
    mail: mailState,
  });

  return {
    scope,
    company: null as CompanyRow | null,
    live,
    outage: databaseOutage(),
    database,
    companies,
    requests,
    open,
    overdue,
    automation,
    tasks,
    taskCounts,
    mail,
    mailState,
    nav,
    openTickets,
  };
});

// What the company admin never reads - kept in the shape so the platform pages type-check unchanged.
const PLATFORM_EMPTY = {
  requests: [],
  open: [],
  overdue: [],
  automation: null,
  tasks: [],
  taskCounts: null,
  mail: { configured: false, target: null, from: "", reachable: null, error: null },
  mailState: "off" as MailState,
  openTickets: 0,
};

export type AdminContext = Awaited<ReturnType<typeof adminContext>>;
