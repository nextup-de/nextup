// The admin area. Outside [company] on purpose: it is not a role, it is a different surface,
// reached at admin.<domain> (or /admin in path mode) behind ADMIN_ACCESS_CODE.
//
// Signed in, it is a sidebar and six pages (features/admin/nav.ts). The sidebar lives here, not
// in each page, so it stays put while a page loads; its badges come from adminContext(), which the
// page shares, so they cost no extra read.
import type { Metadata } from "next";
import Image from "next/image";
import { DEMO_COMPANIES } from "@/features/tenant/demo-companies";
import { dashboardUrl, landingUrl } from "@/features/tenant/urls";
import { adminBase } from "@/features/admin/nav";
import { adminSignOut, isAdmin } from "@/server/actions/admin";
import { adminContext } from "@/server/admin-context";
import { AdminNav } from "@/components/admin/AdminNav";
import styles from "./admin.module.css";

export const metadata: Metadata = { title: "NextUp admin", robots: { index: false, follow: false } };

// Reads cookies and the database on every request; nothing here should ever be prerendered.
export const dynamic = "force-dynamic";

export default async function AdminLayout({ children }: { children: React.ReactNode }) {
  // The two places anyone lands in from here: the public site, and the product itself. The demo
  // tenant is the one company that exists in every mode, database or not.
  const demo = DEMO_COMPANIES[0].slug;
  const signedIn = await isAdmin();
  const ctx = signedIn ? await adminContext() : null;

  return (
    <div className={styles.shell}>
      <header className={styles.bar}>
        <Image src="/brand/nextup-logo-blue.png" alt="NextUp" width={506} height={224} className={styles.logo} />
        <span className={styles.tag}>admin</span>
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
              <a href={dashboardUrl(demo)}>Dashboard</a>
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
            {ctx.live ? null : (
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
        </div>
      ) : (
        <main className={styles.main}>{children}</main>
      )}
    </div>
  );
}
