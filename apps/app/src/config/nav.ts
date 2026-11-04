import type { FlagKey } from "./flags";
import type { Role } from "./roles";

// `flag`: shown only while that feature flag is on for the company (config/flags.ts).
export type NavItem = { label: string; href: string; roles: readonly Role[]; flag?: FlagKey };

// Left rail. Filtered by role in the app shell layout. hrefs are relative to /[company].
export const NAV: NavItem[] = [
  { label: "Dashboard", href: "/dashboard", roles: ["manager"] },
  { label: "Inbox", href: "/leader", roles: ["leader", "manager"] },
  { label: "My cases", href: "/team", roles: ["member", "leader", "manager"] },
  { label: "Feed", href: "/feed", roles: ["member", "leader", "manager"] },
  { label: "Decisions", href: "/decisions", roles: ["member", "leader", "manager"] },
  { label: "Collaboration", href: "/projects/collaboration", roles: ["member", "leader", "manager"] },
  { label: "Projects", href: "/projects", roles: ["member", "leader", "manager"], flag: "projects" },
  { label: "Progress", href: "/projects/progress", roles: ["member", "leader", "manager"] },
  { label: "Settings", href: "/settings", roles: ["manager"] },
];

// The simple shell (SHELL[role] === "simple"): two or three places and a profile button, per role.
// hrefs relative to /[company]. `count` names what the badge next to the label counts.
// `unlessFlag`: shown only while that flag is off (the Overview, once Projects carries it as a tab).
export type SimpleNavItem = { label: string; href: string; count?: "inbox" | "decisions"; flag?: FlagKey; unlessFlag?: FlagKey };
export const NAV_SIMPLE: Record<Role, SimpleNavItem[]> = {
  member: [
    { label: "Ideas", href: "/raise" },
    { label: "Feed", href: "/feed" },
    { label: "Projects", href: "/projects", flag: "projects" },
    { label: "Overview", href: "/overview", unlessFlag: "projects" },
  ],
  leader: [
    { label: "Ideas", href: "/raise" },
    { label: "Inbox", href: "/leader", count: "inbox" },
    { label: "Feed", href: "/feed" },
    { label: "Decisions", href: "/decisions", unlessFlag: "projects" }, // a tab of Projects while that is on
    { label: "Projects", href: "/projects", flag: "projects" },
    { label: "Overview", href: "/overview", unlessFlag: "projects" },
  ],
  manager: [
    { label: "Dashboard", href: "/dashboard" },
    { label: "Inbox", href: "/leader", count: "inbox" }, // tentative: what sits on the manager's own desk (escalations, routes they own)
    { label: "Feed", href: "/feed" },
    { label: "Decisions", href: "/decisions", unlessFlag: "projects" }, // a tab of Projects while that is on
    { label: "Projects", href: "/projects", flag: "projects" },
    { label: "Overview", href: "/overview", unlessFlag: "projects" },
  ],
};

/**
 * The tabs of the Projects area, shown in a strip under the bar. Each page in the area is named by its tab, so
 * no page repeats it as a title. `labelKey` is a message key; `roles`: only these roles see the tab.
 */
export type ProjectsTabKey = "overview" | "decisions" | "collaboration" | "progress";
export type ProjectsTabItem = {
  key: ProjectsTabKey; href: string; roles?: readonly Role[];
  labelKey: "shell.navOverview" | "decisions.tab" | "shell.navCollaboration" | "shell.navProgress";
};
export const PROJECTS_TABS: ProjectsTabItem[] = [
  { key: "overview", labelKey: "shell.navOverview", href: "/projects" },
  { key: "decisions", labelKey: "decisions.tab", href: "/decisions", roles: ["leader", "manager"] },
  { key: "collaboration", labelKey: "shell.navCollaboration", href: "/projects/collaboration" },
  { key: "progress", labelKey: "shell.navProgress", href: "/projects/progress" },
];

export function projectsTabsFor(role: Role): ProjectsTabItem[] {
  return PROJECTS_TABS.filter((tab) => !tab.roles || tab.roles.includes(role));
}

/** Which tab an address (relative to /[company]) is, or null outside the area: a project's own page has its own tabs. */
export function projectsTabAt(path: string): ProjectsTabKey | null {
  if (path === "/overview" || path === "/idea") return "overview"; // an idea opens in place, on the same page as the table
  return PROJECTS_TABS.find((tab) => tab.href === path)?.key ?? null;
}

/**
 * A section gets a strip of tabs under the bar when it has two or more real pages at the same level. Filters are not
 * tabs, and more than about six pages keep a side menu (Settings, the IT console). `needsServer`: the page needs the
 * database, so the offline demo has no such page.
 */
export type SectionKey = "projects" | "dashboard" | "profile";
export type SectionTabItem = {
  key: string; href: string; roles?: readonly Role[]; needsServer?: boolean;
  labelKey: ProjectsTabItem["labelKey"] | "metrics.dashTitle" | "kpis.tab" | "shell.myProfile" | "shell.myReports";
};
export const SECTION_TABS: Record<SectionKey, readonly SectionTabItem[]> = {
  projects: PROJECTS_TABS,
  dashboard: [
    { key: "ledger", labelKey: "metrics.dashTitle", href: "/dashboard" },
    { key: "kpis", labelKey: "kpis.tab", href: "/dashboard/kpis", roles: ["manager"], needsServer: true },
  ],
  profile: [
    { key: "profile", labelKey: "shell.myProfile", href: "/profile" },
    { key: "reports", labelKey: "shell.myReports", href: "/reports", needsServer: true },
  ],
};

export function sectionTabsFor(section: SectionKey, who: { role: Role; serverMode: boolean }): SectionTabItem[] {
  return SECTION_TABS[section].filter((tab) => (!tab.roles || tab.roles.includes(who.role)) && (!tab.needsServer || who.serverMode));
}

/** Which section and tab an address (relative to /[company]) is. Null outside them, and when only one tab would show. */
export function sectionTabAt(path: string, who: { role: Role; serverMode: boolean; flag: (key: FlagKey) => boolean }): { section: SectionKey; tab: string } | null {
  const projects = who.flag("projects") ? projectsTabAt(path) : null;
  if (projects) return { section: "projects", tab: projects };
  for (const section of ["dashboard", "profile"] as const) {
    const tab = SECTION_TABS[section].find((item) => item.href === path);
    if (tab) return sectionTabsFor(section, who).length > 1 ? { section, tab: tab.key } : null;
  }
  return null;
}

/**
 * The account menu's ways to the company's administration: Settings for a manager, while the database
 * they need is there, and the IT console for whom the server names it (`consoleHref`, lib/db/people.ts).
 * `key` is a message key.
 */
export type AdminMenuLink = { key: "shell.navSettings" | "shell.itConsole"; href: string };
export function adminMenuLinks(a: { role: Role; serverMode: boolean; prefix: string; consoleHref: string | null }): AdminMenuLink[] {
  const links: AdminMenuLink[] = [];
  if (a.role === "manager" && a.serverMode) links.push({ key: "shell.navSettings", href: a.prefix + "/settings" });
  if (a.consoleHref) links.push({ key: "shell.itConsole", href: a.consoleHref });
  return links;
}

/** The rail for a role; `flag` answers whether a flagged item is on (DemoProvider's flag()). */
export function navFor(role: Role, flag: (key: FlagKey) => boolean = () => true): NavItem[] {
  return NAV.filter((n) => n.roles.includes(role) && (!n.flag || flag(n.flag)));
}

/** The simple shell's places for a role, flagged ones only while their flag is on. */
export function simpleNavFor(role: Role, flag: (key: FlagKey) => boolean): SimpleNavItem[] {
  return NAV_SIMPLE[role].filter((n) => (!n.flag || flag(n.flag)) && (!n.unlessFlag || !flag(n.unlessFlag)));
}
