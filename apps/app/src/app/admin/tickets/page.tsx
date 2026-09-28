// Tickets: every bug report filed in this deployment, per company (docs/PLATFORM_PLAN.md,
// "Tickets"). The company admin's view. The NextUp team works them in admin.sellux.ch; status and
// replies come back here through server/tickets-sync.ts. ?company=<slug> picks the company.
import { redirect } from "next/navigation";
import { isAdmin } from "@/server/actions/admin";
import { adminContext } from "@/server/admin-context";
import { adminBase } from "@/features/admin/nav";
import { ticketsOfCompany } from "@/lib/db/tickets";
import { ticketSyncConfigured } from "@/server/tickets-sync";
import { ReportsView } from "@/components/report/ReportsView";
import styles from "../admin.module.css";

export default async function TicketsPage({ searchParams }: { searchParams: Promise<{ company?: string }> }) {
  if (!(await isAdmin())) redirect(adminBase() + "/login");
  const ctx = await adminContext();
  const { company } = await searchParams;
  const current = ctx.companies.find((c) => c.slug === company) ?? ctx.companies[0] ?? null;
  const tickets = ctx.live && current ? await ticketsOfCompany(current.id) : [];

  return (
    <>
      <section className={styles.card}>
        <h1>Tickets</h1>
        <p className="nh-hint">
          What people reported with the bug icon{current ? ` in ${current.name}` : ""}.{" "}
          {ticketSyncConfigured()
            ? "Each one is forwarded to the NextUp team (admin.sellux.ch); their replies and status changes show up here and reach the reporter by mail."
            : "OPS_URL / OPS_TOKEN are not set, so reports stay in this deployment only."}
        </p>
        {ctx.companies.length > 1 ? (
          <nav className={styles.pick} aria-label="Company">
            {ctx.companies.map((c) => (
              <a key={c.slug} href={`${adminBase()}/tickets?company=${encodeURIComponent(c.slug)}`} aria-current={c.slug === current?.slug ? "page" : undefined}>
                {c.name}
              </a>
            ))}
          </nav>
        ) : null}
      </section>
      <ReportsView tickets={tickets} screenshotBase={current ? `/api/${current.slug}/tickets` : null} offline={!ctx.live} admin />
    </>
  );
}
