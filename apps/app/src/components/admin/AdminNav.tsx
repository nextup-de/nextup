"use client";
// The admin sidebar: the console's pages, each with the one badge that says whether it needs you.
// Client only for the active link (usePathname); the badges are computed on the server.
import Link from "next/link";
import { usePathname } from "next/navigation";
import type { AdminPage, NavItem } from "@/features/admin/nav";
import styles from "@/app/admin/admin.module.css";

const ICONS: Record<AdminPage, React.ReactNode> = {
  overview: <path d="M3 3h6v6H3zM11 3h6v4h-6zM11 9h6v8h-6zM3 11h6v6H3z" />,
  people: <path d="M7.5 9a3 3 0 1 0 0-6 3 3 0 0 0 0 6zM2 17a5.5 5.5 0 0 1 11 0M13 3.5a3 3 0 0 1 0 5.5M15 12a5 5 0 0 1 3 5" />,
  access: <path d="M10 2.5l6 2.5v4.5c0 4-2.6 6.6-6 8-3.4-1.4-6-4-6-8V5zM7.5 10l2 2 3.5-4" />,
  connectors: <path d="M7.5 3v4M12.5 3v4M5.5 7h9v3a4.5 4.5 0 0 1-9 0zM10 14.5V17" />,
  routing: <path d="M3 16h14M5 13l3-4 3 2 4-6M14 5h2v2" />,
  support: <path d="M4 10a6 6 0 0 1 12 0M3 10v3h2.5v-3.5H3zM17 10v3h-2.5v-3.5H17zM15 13.5c0 1.5-2 2.5-5 2.5" />,
  assistant: <path d="M4 4h12v9H9l-4 3v-3H4zM7.5 8.5h.01M10 8.5h.01M12.5 8.5h.01" />,
  data: <path d="M10 3v4M10 7H5v4M10 7h5v4M3 11h4v4H3zM13 11h4v4h-4zM8 3h4v4H8z" />,
};

export function AdminNav({ items, base }: { items: NavItem[]; base: string }) {
  const pathname = usePathname() ?? "";
  const here = (i: NavItem) => {
    const href = base + i.path || "/";
    return i.path === "" ? pathname === href || pathname === href + "/" : pathname.startsWith(href);
  };

  return (
    <nav className={styles.sideNav} aria-label="Admin">
      {items.map((i) => (
        <Link
          key={i.id}
          href={base + i.path || "/"}
          className={styles.sideLink}
          aria-current={here(i) ? "page" : undefined}
          data-tone={i.tone ?? undefined}
        >
          <svg viewBox="0 0 20 20" width="18" height="18" aria-hidden="true" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinejoin="round" strokeLinecap="round">
            {ICONS[i.id]}
          </svg>
          <span className={styles.sideLabel}>{i.label}</span>
          {i.badge ? <span className={styles.navBadge}>{i.badge}</span> : null}
        </Link>
      ))}
    </nav>
  );
}
