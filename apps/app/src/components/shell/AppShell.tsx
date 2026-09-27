"use client";
// The authenticated app chrome: rail (nav by role) + top bar + content, plus
// the overlays every page shares: input sheet, toast, dev panel. Port of the shell in
// legacy/demo/index.html; state comes from DemoProvider, nav from src/config/nav.ts.
import Image from "next/image";
import Link from "next/link";
import { usePathname } from "next/navigation";
import { navFor } from "@/config/nav";
import { SHELL } from "@/config/roles";
import { SITE } from "@/config/site";
import { useDemo } from "@/components/dashboard/DemoProvider";
import { mineRows, openCases } from "@/components/dashboard/derive";
import { DevPanel } from "./DevPanel";
import { Ground } from "./Ground";
import { InputSheet } from "./InputSheet";
import { SimpleShell } from "./SimpleShell";
import { TopBar } from "./TopBar";
import styles from "./AppShell.module.css";

export function AppShell({ children }: { children: React.ReactNode }) {
  const ctx = useDemo();
  if (SHELL[ctx.role] === "simple") return <SimpleShell>{children}</SimpleShell>;
  return <RailShell>{children}</RailShell>;
}

// The full chrome: rail (nav by role) + top bar. Leaders and managers.
function RailShell({ children }: { children: React.ReactNode }) {
  const ctx = useDemo();
  const { tenant, role, persona, N, menu, setMenu, pop, setPop, sheet, toast } = ctx;
  const pathname = usePathname();

  // Rail counts, everything counted from the rows.
  const cnt = (n: number) => (n ? String(n) : "");
  const countFor: Record<string, string> = {
    "/team": cnt(mineRows(ctx).length),
    "/leader": cnt(openCases(ctx).length),
    "/problems": cnt(N.problems),
    "/ideas": cnt(N.ideas),
    "/collaboration": cnt(N.initiatives),
  };

  return (
    <div className={styles.root}>
      <Ground />
      <aside className={styles.rail} data-open={menu ? "true" : undefined} aria-label="Main">
        <div className={styles.brand}>
          <Image src="/brand/nextup-logo-blue.png" alt={SITE.name} width={506} height={224} className={styles.logo} />
          <span className={styles.brandText}>
            <span className={styles.brandTenant}>{tenant.name}</span>
          </span>
          <button type="button" className={styles.close} onClick={() => setMenu(false)} aria-label="Close menu">×</button>
        </div>

        <div className={styles.railLabel}>Views</div>
        <nav className={styles.nav}>
          {navFor(role).map((n) => {
            const href = "/" + tenant.slug + n.href;
            const active = pathname === href || pathname.startsWith(href + "/");
            return (
              <Link key={n.href} href={href} className={styles.navItem} data-active={active ? "true" : undefined} onClick={() => { setPop(null); setMenu(false); }}>
                <span>{n.label}</span>
                <span className={styles.navCount}>{countFor[n.href] ?? ""}</span>
              </Link>
            );
          })}
        </nav>

        <div className={styles.user}>
          <span className={styles.userAvatar}>{persona.who.ini}</span>
          <span className={styles.userText}>
            <span className={styles.userName}>{persona.who.name}</span>
            <span className={styles.userLine}>{persona.who.line}</span>
          </span>
        </div>
      </aside>

      <div className={styles.main}>
        <TopBar />
        <main className={styles.content}>
          <div className={styles.contentInner}>{children}</div>
        </main>
      </div>

      {/* click anywhere else closes search / decisions / user menu */}
      {pop && <div className={styles.backdrop} onClick={() => setPop(null)} />}
      {sheet && <InputSheet />}
      {toast && <div className={styles.toast} role="status">{toast}</div>}
      {menu && <div className={styles.scrim} onClick={() => setMenu(false)} />}
      <DevPanel />
    </div>
  );
}
