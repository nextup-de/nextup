// Everything the /admin pages read, loaded once per request.
//
// The layout needs it for the sidebar badges and every page needs a slice of it, so it is wrapped
// in React's cache(): the layout and the page share one read per request, not one each.
//
// The console (ITC/D5) is the stack's own company and nothing else: no company list, no pilot
// requests, no notices, no mail relay. Those belong to admin.sellux.ch.
import { cache } from "react";
import { ownCompanyRow } from "@/server/actions/admin";
import { demoCompanies } from "@/features/admin/demo";
import { consoleNav, lockedOut } from "@/features/admin/nav";
import type { CompanyRow } from "@/features/admin/rows";
import { databaseOutage, hasDatabase } from "@/lib/db/client";
import { getT } from "@/i18n/server";

export const adminContext = cache(async () => {
  const live = hasDatabase();
  // The stack's database holds this one company; without a database the demo company stands in.
  const company: CompanyRow | null = live ? await ownCompanyRow() : ((await demoCompanies())[0] ?? null);
  const t = await getT();
  const nav = consoleNav(t, { locked: company ? lockedOut(company).length : 0 });
  return { live, outage: databaseOutage(), company, nav };
});

export type AdminContext = Awaited<ReturnType<typeof adminContext>>;
