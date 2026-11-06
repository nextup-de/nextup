"use client";
// The settings menu: grouped links on the left, one "Settings: <page>" sheet on phones. Props in;
// the layout decides which sections show.
import Link from "next/link";
import { usePathname } from "next/navigation";
import s from "./settings.module.css";

export type MenuItem = { key: string; href: string; label: string };
export type MenuGroup = { key: string; label: string | null; items: MenuItem[] };

// Test ids sit on the desktop links only, so each stays unique on the page.
function Links({ groups, current, ids }: { groups: MenuGroup[]; current: string | undefined; ids?: boolean }) {
  return groups.map((g) => (
    <div key={g.key} className={s.group}>
      {g.label ? <div className={s.groupLabel}>{g.label}</div> : null}
      {g.items.map((i) => (
        <Link key={i.key} prefetch={false} href={i.href} className={s.item} data-key={i.key} aria-current={i.key === current ? "page" : undefined} data-testid={ids ? `settings-nav-${i.key}` : undefined}>
          {i.label}
        </Link>
      ))}
    </div>
  ));
}

export type SetupLink = { href: string; label: string; open: boolean };

/**
 * `setup`: the way into the setup process, which is not a section of Settings. A pill above the
 * sections while the company is still closed; a plain link below them once it is open.
 */
export function SettingsMenu({ title, aria, currentLabel, groups, setup }: { title: string; aria: string; currentLabel: string; groups: MenuGroup[]; setup?: SetupLink }) {
  const path = usePathname();
  const items = groups.flatMap((g) => g.items);
  const current = items.find((i) => path === i.href || path.startsWith(`${i.href}/`));
  const pill = setup && !setup.open ? setup : undefined;
  const after = setup?.open ? setup : undefined;
  return (
    <>
      <nav aria-label={aria} className={s.menu}>
        <h2 className={s.menuTitle}>{title}</h2>
        {pill ? <Link href={pill.href} className={s.setupPill} data-testid="settings-setup-pill">{pill.label}</Link> : null}
        <Links groups={groups} current={current?.key} ids />
        {after ? <div className={s.group}><Link prefetch={false} href={after.href} className={s.item} data-testid="settings-setup-link">{after.label}</Link></div> : null}
      </nav>
      <details className={s.sheet} key={path}>
        <summary>
          {currentLabel.replace("{page}", current?.label ?? "")}
          <svg width="14" height="14" viewBox="0 0 12 12" fill="none" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true"><path d="m3 4.5 3 3 3-3" /></svg>
        </summary>
        <div className={s.sheetBody}>
          {pill ? <Link href={pill.href} className={s.setupPill}>{pill.label}</Link> : null}
          <Links groups={groups} current={current?.key} />
          {after ? <div className={s.group}><Link prefetch={false} href={after.href} className={s.item}>{after.label}</Link></div> : null}
        </div>
      </details>
    </>
  );
}
