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
        <Link key={i.key} prefetch={false} href={i.href} className={s.item} aria-current={i.key === current ? "page" : undefined} data-testid={ids ? `settings-nav-${i.key}` : undefined}>
          {i.label}
        </Link>
      ))}
    </div>
  ));
}

export function SettingsMenu({ title, aria, currentLabel, groups }: { title: string; aria: string; currentLabel: string; groups: MenuGroup[] }) {
  const path = usePathname();
  const items = groups.flatMap((g) => g.items);
  const current = items.find((i) => path === i.href || path.startsWith(`${i.href}/`));
  return (
    <>
      <nav aria-label={aria} className={s.menu}>
        <h2 className={s.menuTitle}>{title}</h2>
        <Links groups={groups} current={current?.key} ids />
      </nav>
      <details className={s.sheet} key={path}>
        <summary>
          {currentLabel.replace("{page}", current?.label ?? "")}
          <svg width="14" height="14" viewBox="0 0 12 12" fill="none" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true"><path d="m3 4.5 3 3 3-3" /></svg>
        </summary>
        <div className={s.sheetBody}>
          <Links groups={groups} current={current?.key} />
        </div>
      </details>
    </>
  );
}
