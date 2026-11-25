"use client";
// The chrome for every role: the logo, two or three
// places (NAV_SIMPLE[role], flagged ones while on), and a profile button. Search expands into the navigation pill.
// Holds the overlays too (input sheet, toast, dev panel) so every action still works.
import Link from "next/link";
import { usePathname } from "next/navigation";
import { useLayoutEffect, useRef, useState } from "react";
import { adminMenuLinks, bringsOwnSideView, hasSideView, sectionTabAt, visibleSimpleNav, type ProjectsTabKey } from "@/config/nav";
import { ProjectsFrame } from "@/components/projects/ProjectsFrame";
import { caseIdAt, projectIdAt } from "@/features/projects/sidebar";
import { SITE } from "@/config/site";
import { useDemo } from "@/components/dashboard/DemoProvider";
import { ideaHomeOf, inboxTotal, mineRows } from "@/components/dashboard/derive";
import { useT } from "@/i18n/client";
import { AreaFrame } from "./AreaFrame";
import { NavSearch, navLabel } from "./NavSearch";
import { decisionsWaiting } from "@/features/metrics";
import { DevPanel } from "./DevPanel";
import { Ground } from "./Ground";
import { InputSheet } from "./InputSheet";
import { SectionTabs } from "./SectionTabs";
import styles from "./SimpleShell.module.css";

/** An idea's page sits in the Inbox's side view, its Inbox page the way back (DESIGN_RULES §8). */
const IDEA_AREA = { section: "inbox", tab: "inbox" } as const;
// A raiser whose bar has no Inbox finds an opened idea under Ideas › Mine instead (derive.ts ideaHomeOf).
const MINE_AREA = { section: "ideas", tab: "mine" } as const;

export function SimpleShell({ children }: { children: React.ReactNode }) {
  const ctx = useDemo();
  const t = useT();
  const { tenant, role, persona, actor, email, pop, setPop, togglePop, sheet, toast, logout, D } = ctx;
  const pathname = usePathname();
  const who = persona.who;
  // On a page of a section with several pages, the strip of its tabs hangs under the bar.
  const area = sectionTabAt(pathname.slice(tenant.prefix.length), { role, serverMode: ctx.serverMode, flag: ctx.flag });
  // The Projects area (its tabs and every project's page) sits next to the projects sidebar, which then carries the tabs.
  const projectId = ctx.flag("projects") ? projectIdAt(pathname.slice(tenant.prefix.length)) : null;
  // An idea's page (/cases/<id>, or /idea?id=) is no part of Projects (Kevin and Sam, 16 Nov 2026): it belongs to the Inbox,
  // where ideas are decided, and sits in the Inbox's side view, with the walk through the inbox and its own pages under it
  // (Kevin, 17 Nov 2026: one layout for an open idea, however it was opened; components/inbox/IdeaInboxSide.tsx).
  const caseId = ctx.flag("projects") ? caseIdAt(pathname.slice(tenant.prefix.length)) : null;
  const onIdea = ctx.flag("projects") && (caseId !== null || pathname === tenant.prefix + "/idea");
  const projectsArea = area?.section === "projects" ? (area.tab as ProjectsTabKey) : null;
  const inProjects = projectsArea !== null || projectId !== null;
  // Any other area with several pages lists them in its own side view (AreaFrame); the strip then shows on a phone only.
  // A page that brings its own side view (the raise page) is not wrapped in a second one; its strip is still a phone's alone.
  const ownSide = area !== null && !inProjects && hasSideView(area.section) && bringsOwnSideView(pathname.slice(tenant.prefix.length));
  const ideaArea = onIdea && ideaHomeOf(ctx) === "mine" ? MINE_AREA : IDEA_AREA;
  const sideArea = area && !inProjects && hasSideView(area.section) && !ownSide ? area : onIdea && !inProjects ? ideaArea : null;
  // The blue thumb slides under the current place: measured from the active link, re-measured on resize.
  const navRef = useRef<HTMLElement>(null);
  const [thumb, setThumb] = useState<{ x: number; w: number } | null>(null);
  useLayoutEffect(() => {
    const nav = navRef.current;
    if (!nav) return;
    const measure = () => {
      const on = nav.querySelector<HTMLElement>('[aria-current="page"]');
      setThumb(on ? { x: on.offsetLeft, w: on.offsetWidth } : null);
      // On a phone five places scroll inside the pill: keep the current one in view.
      if (on && nav.scrollWidth > nav.clientWidth) nav.scrollLeft = Math.max(0, on.offsetLeft + on.offsetWidth / 2 - nav.clientWidth / 2);
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
  const counts = { inbox: inboxTotal(ctx), decisions: decisionsWaiting(D).length };
  // Profile numbers per role: what this person sent (member), what they decided (leader). What waits on
  // someone is the bar's badge, so the menu does not count it again (DESIGN_RULES §9); a manager gets none.
  const decided = D.cases.filter((c) => ctx.actorUserId !== null && c.decided?.byUserId === ctx.actorUserId).length;
  const stats: [number, string][] = role === "manager"
    ? []
    : role === "leader"
      ? [[decided, t("shell.statDecided")]]
      : [[mine.length, t("shell.statRaised")], [shipped, t("shell.statShipped")]];
  const sent = role !== "manager"; // members and leaders raise things; the footer link follows them

  return (
    <div className={styles.root}>
      <Ground />
      <header className={styles.bar}>
        {/* The blue wordmark carries the name; the company only shows on hover (the mockup keeps the bar to three things). */}
        <Link href={tenant.prefix + "/raise"} className={styles.brand} title={tenant.name} onClick={() => setPop(null)}>
          {/* The wordmark's shape as a mask, painted in the colour the dev panel picks (blue, blue + black, black). */}
          <span className={styles.logo} role="img" aria-label={SITE.name} />
        </Link>

        <NavSearch>{(searchOpen) => (
        <nav ref={navRef} className={styles.nav} aria-label={t("shell.navMain")} inert={searchOpen} aria-hidden={searchOpen}>
          {thumb && <span className={styles.navThumb} style={{ transform: "translateX(" + thumb.x + "px)", width: thumb.w }} aria-hidden="true" />}
          {visibleSimpleNav(role, ctx.flag, counts).map((n, _i, all) => {
            const hasProgress = all.some((x) => x.href === "/ideas");
            const href = tenant.prefix + n.href;
            // Without projects a case opens from the Overview, so its page counts as the Overview. With projects it counts as the Inbox.
            const inOverview = pathname === tenant.prefix + "/overview" || (!onIdea && (pathname === tenant.prefix + "/idea" || pathname.startsWith(tenant.prefix + "/cases/")));
            const active = pathname === href || pathname.startsWith(href + "/") || ((n.href === "/overview" || n.href === "/projects") && inOverview) || (n.href === "/projects" && area?.section === "projects")
              || (n.href === "/inbox" && (area?.section === "inbox" || (onIdea && ideaArea === IDEA_AREA))) || (n.href === "/raise" && area?.section === "ideas" && !(hasProgress && area.tab === "mine"))
              // With a Progress place (members), my ideas and their pages light Progress, not Raise.
              || (n.href === (hasProgress ? "/ideas" : "/raise") && onIdea && ideaArea === MINE_AREA);
            const n1 = n.count ? counts[n.count] : 0;
            return (
              <Link key={n.href} href={href} className={styles.navItem} data-active={active ? "true" : undefined} aria-current={active ? "page" : undefined} onClick={() => setPop(null)}>
                {navLabel(t, n.label)}{n1 > 0 && <span className={styles.navCount}>{n1}</span>}
              </Link>
            );
          })}
        </nav>
        )}</NavSearch>

        <div className={styles.right}>
          <button type="button" className={styles.avatar} data-open={pop === "me" ? "true" : undefined} onClick={() => togglePop("me")} aria-label={t("shell.profile")} title={who.name + " · " + who.line}>
            {who.ini}
          </button>
          {pop === "me" && (
            <div className={styles.me} role="dialog" aria-label={t("shell.profile")}>
              <div className={styles.meHead}>
                <span className={styles.meAvatar}>{who.ini}</span>
                <span className={styles.meText}>
                  <span className={styles.meName}>{who.name}</span>
                  <span className={styles.meLine}>{who.line}</span>
                  {email && <span className={styles.meLine}>{email}</span>}
                  {/* Only worth a line when it differs from the name: the employee posts under a handle. */}
                  {anon && <span className={styles.meLine}>{t("shell.othersSeeYouAs", { handle: actor })}</span>}
                </span>
              </div>
              {stats.some(([n]) => n > 0) && (
                <div className={styles.meStats}>
                  {stats.filter(([n]) => n > 0).map(([n, label]) => <span key={label}><strong>{n}</strong> {label}</span>)}
                </div>
              )}
              <div className={styles.meFoot}>
                <span className={styles.meLinks}>
                  <Link href={tenant.prefix + "/profile"} className={styles.meLink} onClick={() => setPop(null)}>{t("shell.myProfile")} <span aria-hidden="true">→</span></Link>
                  {sent && <Link href={tenant.prefix + "/team"} className={styles.meLink} onClick={() => setPop(null)}>{t("shell.whatISent")} <span aria-hidden="true">→</span></Link>}
                  {/* Bug reports need the database - the offline demo has none. */}
                  {adminMenuLinks({ role, serverMode: ctx.serverMode, prefix: tenant.prefix, consoleHref: tenant.consoleHref ?? null }).map((l) => (
                    <Link key={l.key} href={l.href} className={styles.meLink} onClick={() => setPop(null)}>{t(l.key)} <span aria-hidden="true">→</span></Link>
                  ))}
                </span>
                <button type="button" className={styles.logout} onClick={logout}>{t("shell.logOut")}</button>
              </div>
            </div>
          )}
        </div>
      </header>
      {area && !inProjects && <SectionTabs section={area.section} active={area.tab} side={sideArea !== null || ownSide} />}

      <main className={styles.content}>
        <div className={styles.contentInner}>
          {inProjects ? <ProjectsFrame area={projectsArea} projectId={projectId}>{children}</ProjectsFrame>
            : sideArea ? <AreaFrame section={sideArea.section} active={sideArea.tab}>{children}</AreaFrame>
            : children}
        </div>
      </main>

      {pop && <div className={styles.backdrop} onClick={() => setPop(null)} />}
      {sheet && <InputSheet />}
      {toast && <div className={styles.toast} role="status">{toast}</div>}
      <DevPanel />
    </div>
  );
}
