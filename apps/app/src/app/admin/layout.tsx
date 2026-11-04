// The admin area. Outside [company] on purpose: it is not a role, it is a different surface,
// reached at admin.<domain> (or /admin in path mode) behind ADMIN_ACCESS_CODE.
//
// Signed in, it is a sidebar and its pages (features/admin/nav.ts): the company's console. The sidebar lives here, not
// in each page, so it stays put while a page loads; its badges come from adminContext(), which the
// page shares, so they cost no extra read.
import type { Metadata } from "next";
import Image from "next/image";
import { DEMO_COMPANIES } from "@/features/tenant/demo-companies";
import { dashboardUrl, landingUrl, singleCompany } from "@/features/tenant/urls";
import { getLocale, getT } from "@/i18n/server";
import { formatDate } from "@/i18n/format";
import { consoleCompany } from "@/server/console-guard";
import { adminBase } from "@/features/admin/nav";
import { adminSignOut, isAdmin } from "@/server/actions/admin";
import { adminActor, adminBreakGlassActive } from "@/server/admin-session";
import { adminContext } from "@/server/admin-context";
import { AdminNav } from "@/components/admin/AdminNav";
import { Ground } from "@/components/shell/Ground";
import { ReportButton } from "@/components/report/ReportButton";
import { reportFromAdmin } from "@/server/actions/tickets";
import { hasDatabase } from "@/lib/db/client";
import styles from "./admin.module.css";

export const metadata: Metadata = { title: "NextUp admin", robots: { index: false, follow: false } };

// Reads cookies and the database on every request; nothing here should ever be prerendered.
export const dynamic = "force-dynamic";

export default async function AdminLayout({ children }: { children: React.ReactNode }) {
  // The two places anyone lands in from here: the public site, and the product itself. The demo
  // tenant is the one company that exists in every mode, database or not.
  const demo = DEMO_COMPANIES[0].slug;
  const company = singleCompany() !== null;
  const signedIn = await isAdmin();
  const ctx = signedIn ? await adminContext() : null;
  const actor = signedIn ? await adminActor() : null;
  const breakGlass = signedIn && (await adminBreakGlassActive());
  const t = await getT();
  const support = signedIn && company ? (await consoleCompany())?.supportUntil : undefined;
  const supportUntil = support ? formatDate(await getLocale(), support, "dateTime") : null;

  return (
    <div className={styles.shell}>
      <Ground />
      <header className={styles.bar}>
        <Image src="/brand/nextup-logo-blue.png" alt="NextUp" width={506} height={224} className={styles.logo} />
        <span className={styles.tag}>admin</span>
        {actor ? <span className={styles.who}>{actor}</span> : null}
        <nav className={styles.barNav}>
          {signedIn ? (
            // Signed in, every way out of the admin area logs out first (adminSignOut, `to`), so
            // an unlocked admin session is never left behind in a tab that moved on.
            <form action={adminSignOut}>
              <button type="submit" name="to" value="landing" className={styles.logout}>Landing page</button>
              <button type="submit" name="to" value="dashboard" className={styles.logout}>Dashboard</button>
              <button type="submit" className={`${styles.logout} ${styles.logoutEnd}`}>Log out</button>
            </form>
          ) : (
            <>
              <a href={landingUrl()}>Landing page</a>
              <a href={dashboardUrl(singleCompany() ?? demo)}>Dashboard</a>
            </>
          )}
        </nav>
      </header>
      {ctx ? (
        <div className={styles.frame}>
          <aside className={styles.side}>
            <AdminNav items={ctx.nav} base={adminBase()} />
          </aside>
          <main className={styles.content}>
            {breakGlass ? <p className={`${styles.card} ${styles.error}`} role="status">{t("adminAccess.breakGlassBanner")}</p> : null}
            {supportUntil ? <p className={`${styles.card} ${styles.error}`} role="status" data-testid="console-support-banner">{t("adminSupport.banner", { time: supportUntil })}</p> : null}
            {ctx.live ? null : company ? (
              <section className={`${styles.card} ${styles.demoNotice}`}>
                <h2>Not connected</h2>
                <p>The database is not answering, so nothing can be changed right now. Try again in a few minutes; if it stays like this, tell the NextUp team.</p>
              </section>
            ) : (
              <section className={`${styles.card} ${styles.demoNotice}`}>
                <h2>Demo data</h2>
                <p>
                  The real database is not being read. What is shown is the built-in demo company -
                  the same one the dashboard runs on - so nothing here is a real customer.
                </p>
                <p className="nh-hint">
                  {ctx.outage ? `DATABASE_URL is set but ${ctx.outage}. ` : "No DATABASE_URL is configured. "}
                  Everything that writes is hidden until Postgres answers: start the stack with{" "}
                  <code>docker compose up</code>, or start Postgres (<code>docker start nextup-dev-db</code>) -
                  Connections notices by itself.
                </p>
              </section>
            )}
            {children}
          </main>
          {/* The bug icon for the company admin: in a one-company stack, where a report has a company. */}
          {ctx.live && hasDatabase() && singleCompany() ? <ReportButton submit={reportFromAdmin} reportsHref={null} /> : null}
        </div>
      ) : (
        <main className={styles.main}>{children}</main>
      )}
    </div>
  );
}
