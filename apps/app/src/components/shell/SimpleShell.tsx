"use client";
// The chrome for every role in the demo (SHELL[role] === "simple"): the logo, two or three
// places (NAV_SIMPLE[role]), and a profile button. No rail, no search - nothing to learn.
// Shares the overlays with AppShell (input sheet, toast, dev panel) so every action still works.
import Image from "next/image";
import Link from "next/link";
import { usePathname } from "next/navigation";
import { useLayoutEffect, useRef, useState } from "react";
import { NAV_SIMPLE } from "@/config/nav";
import { SITE } from "@/config/site";
import { useDemo } from "@/components/dashboard/DemoProvider";
import { inboxCount, mineRows } from "@/components/dashboard/derive";
import { decisionsWaiting } from "@/features/metrics";
import { DevPanel } from "./DevPanel";
import { Ground } from "./Ground";
import { InputSheet } from "./InputSheet";
import styles from "./SimpleShell.module.css";

export function SimpleShell({ children }: { children: React.ReactNode }) {
  const ctx = useDemo();
  const { tenant, role, persona, actor, email, pop, setPop, togglePop, sheet, toast, logout, D } = ctx;
  const pathname = usePathname();
  const who = persona.who;
  // The ink thumb slides under the current place: measured from the active link, re-measured on resize.
  const navRef = useRef<HTMLElement>(null);
  const [thumb, setThumb] = useState<{ x: number; w: number } | null>(null);
  useLayoutEffect(() => {
    const nav = navRef.current;
    if (!nav) return;
    const measure = () => {
      const on = nav.querySelector<HTMLElement>('[aria-current="page"]');
      setThumb(on ? { x: on.offsetLeft, w: on.offsetWidth } : null);
    };
    measure();
    const ro = new ResizeObserver(measure); ro.observe(nav);
    nav.querySelectorAll<HTMLElement>("a").forEach((a) => ro.observe(a)); // the links reflow before the nav does
    window.addEventListener("resize", measure);
    return () => { ro.disconnect(); window.removeEventListener("resize", measure); };
  }, [pathname, role]);
  const anon = actor !== who.name; // the employee posts under a handle
  const mine = mineRows(ctx);
  const shipped = mine.filter((m) => m.status === "Shipped").length;
  // Badges: what is waiting on this person right now.
  const counts = { inbox: inboxCount(ctx), decisions: decisionsWaiting(D).length };
  // Profile numbers per role: what this person sent (member), what sits on their desk and what they
  // decided (leader), what waits on them (manager). A manager raises nothing, so "0 raised" is noise.
  const decided = D.cases.filter((c) => c.decided?.by === who.name).length;
  const stats: [number, string][] = role === "manager"
    ? [[counts.decisions, counts.decisions === 1 ? "decision waiting" : "decisions waiting"]]
    : role === "leader"
      ? [[counts.inbox, "in inbox"], [decided, "decided"]]
      : [[mine.length, "raised"], [shipped, "shipped"]];
  const sent = role !== "manager"; // members and leaders raise things; the footer link follows them

  return (
    <div className={styles.root}>
      <Ground />
      <header className={styles.bar}>
        {/* The blue wordmark carries the name; the company only shows on hover (the mockup keeps the bar to three things). */}
        <Link href={"/" + tenant.slug + "/raise"} className={styles.brand} title={tenant.name} onClick={() => setPop(null)}>
          <Image src="/brand/nextup-logo-blue.png" alt={SITE.name} width={506} height={224} className={styles.logo} priority />
        </Link>

        <nav ref={navRef} className={styles.nav} aria-label="Main">
          {thumb && <span className={styles.navThumb} style={{ transform: "translateX(" + thumb.x + "px)", width: thumb.w }} aria-hidden="true" />}
          {NAV_SIMPLE[role].map((n) => {
            const href = "/" + tenant.slug + n.href;
            const active = pathname === href || pathname.startsWith(href + "/");
            const n1 = n.count ? counts[n.count] : 0;
            return (
              <Link key={n.href} href={href} className={styles.navItem} data-active={active ? "true" : undefined} aria-current={active ? "page" : undefined} onClick={() => setPop(null)}>
                {n.label}{n1 > 0 && <span className={styles.navCount}>{n1}</span>}
              </Link>
            );
          })}
        </nav>

        <div className={styles.right}>
          <button type="button" className={styles.avatar} data-open={pop === "me" ? "true" : undefined} onClick={() => togglePop("me")} aria-label="Profile" title={who.name + " · " + who.line}>
            {who.ini}
          </button>
          {pop === "me" && (
            <div className={styles.me} role="dialog" aria-label="Profile">
              <div className={styles.meHead}>
                <span className={styles.meAvatar}>{who.ini}</span>
                <span className={styles.meText}>
                  <span className={styles.meName}>{who.name}</span>
                  <span className={styles.meLine}>{who.line}</span>
                  {email && <span className={styles.meLine}>{email}</span>}
                </span>
              </div>
              <div className={styles.meStats}>
                <span><strong>{persona.role.label}</strong></span>
                {stats.map(([n, label]) => <span key={label}><strong>{n}</strong> {label}</span>)}
              </div>
              {/* Only worth showing when it differs from the header: the employee posts under a handle. */}
              {anon && (
                <div className={styles.mePreview}>
                  <span className={styles.mePreviewLabel}>How others see you</span>
                  <span className={styles.mePreviewName}>{actor}</span>
                  <span className={styles.meLine}>Anonymous · name and role hidden</span>
                </div>
              )}
              <div className={styles.meFoot} data-single={sent ? undefined : "true"}>
                {sent && <Link href={"/" + tenant.slug + "/team"} className={styles.meLink} onClick={() => setPop(null)}>What happened to what I sent →</Link>}
                <button type="button" className={styles.logout} onClick={logout}>Log out</button>
              </div>
            </div>
          )}
        </div>
      </header>

      <main className={styles.content}>
        <div className={styles.contentInner}>{children}</div>
      </main>

      {pop && <div className={styles.backdrop} onClick={() => setPop(null)} />}
      {sheet && <InputSheet />}
      {toast && <div className={styles.toast} role="status">{toast}</div>}
      <DevPanel />
    </div>
  );
}
