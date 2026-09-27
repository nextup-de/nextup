// Everything the /admin pages read, loaded once per request.
//
// The layout needs it for the sidebar badges and every page needs a slice of it, so it is wrapped
// in React's cache(): the layout and the page share one read per request, not one each.
//
// databaseReport() goes first and alone - it settles whether Postgres is actually there. Asking it
// after the reads would mean a 500 for anyone whose database went away mid-request, which is the
// one moment /admin most needs to render.
import { cache } from "react";
import {
  automationReport,
  automationTasks,
  databaseReport,
  listCompanies,
  listPilotRequests,
} from "@/server/actions/admin";
import { demoCompanies, demoPilotRequests } from "@/features/admin/demo";
import { adminNav, type MailState } from "@/features/admin/nav";
import { isOverdue } from "@/features/admin/requests";
import { countByState } from "@/features/integrations/tasks";
import { databaseOutage, hasDatabase } from "@/lib/db/client";
import { mailStatus } from "@/server/mail";

export const adminContext = cache(async () => {
  const database = await databaseReport();
  const live = hasDatabase();
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

  const nav = adminNav({
    database: database.state,
    openRequests: open.length,
    overdueRequests: overdue.length,
    companies: companies.length,
    automation: automation?.summary.state ?? null,
    tasks: taskCounts,
    mail: mailState,
  });

  return {
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
  };
});

export type AdminContext = Awaited<ReturnType<typeof adminContext>>;
