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
  if (path === "/overview") return "overview";
  return PROJECTS_TABS.find((tab) => tab.href === path)?.key ?? null;
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
