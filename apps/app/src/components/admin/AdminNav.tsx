"use client";
// The admin sidebar: six pages, each with the one badge that says whether it needs you.
// Client only for the active link (usePathname); the badges are computed on the server.
import Link from "next/link";
import { usePathname } from "next/navigation";
import type { AdminPage, NavItem } from "@/features/admin/nav";
import styles from "@/app/admin/admin.module.css";

const ICONS: Record<AdminPage, React.ReactNode> = {
  overview: <path d="M3 3h6v6H3zM11 3h6v4h-6zM11 9h6v8h-6zM3 11h6v6H3z" />,
  requests: <path d="M3 5l7 5 7-5M3 5h14v10H3z" />,
  companies: <path d="M4 17V4h7v13M11 8h5v9M2 17h16M6.5 7h2M6.5 10h2M6.5 13h2" />,
  knowledge: <path d="M10 3v4M10 7H5v4M10 7h5v4M3 11h4v4H3zM13 11h4v4h-4zM8 3h4v4H8z" />,
  decisions: <path d="M3 16h14M5 13l3-4 3 2 4-6M14 5h2v2" />,
  connections: <path d="M7 7l-3 3 3 3M13 7l3 3-3 3M11 5l-2 10" />,
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
