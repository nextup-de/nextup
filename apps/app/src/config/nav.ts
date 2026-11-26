import type { FlagKey } from "./flags";
import type { Role } from "./roles";

// `flag`: shown only while that feature flag is on for the company (config/flags.ts).
export type NavItem = { label: string; href: string; roles: readonly Role[]; flag?: FlagKey };

// Left rail. Filtered by role in the app shell layout. hrefs are relative to /[company].
export const NAV: NavItem[] = [
  { label: "Dashboard", href: "/dashboard", roles: ["manager"] },
  { label: "Inbox", href: "/inbox", roles: ["leader", "manager"] },
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
// `hideWhenEmpty`: shown only while its count is above 0 (a member sees the Inbox only while something waits for them).
export type SimpleNavItem = { label: string; href: string; count?: "inbox" | "decisions"; flag?: FlagKey; unlessFlag?: FlagKey; hideWhenEmpty?: boolean };
export const NAV_SIMPLE: Record<Role, SimpleNavItem[]> = {
  // Raise: ideas live here before they are published. Progress: where my published ideas are, update them and answer
  // whoever received them. Explore: campaigns and public ideas. (Sam's idea-to-project rework, 19 Nov 2026.)
  member: [
    { label: "Raise", href: "/raise" },
    { label: "Progress", href: "/ideas" },
    { label: "Projects", href: "/projects", flag: "projects" },
    { label: "Overview", href: "/overview", unlessFlag: "projects" },
    { label: "Explore", href: "/feed" },
  ],
  leader: [
    { label: "Raise", href: "/raise" },
    { label: "Inbox", href: "/inbox", count: "inbox" },
    { label: "Decisions", href: "/decisions", unlessFlag: "projects" }, // a tab of the Inbox while that is on
    { label: "Projects", href: "/projects", flag: "projects" },
    { label: "Overview", href: "/overview", unlessFlag: "projects" },
    { label: "Explore", href: "/feed" },
  ],
  manager: [
    { label: "Dashboard", href: "/dashboard" },
    { label: "Inbox", href: "/inbox", count: "inbox" }, // what is asked of the manager: their desk, results to confirm, rewards due
    { label: "Decisions", href: "/decisions", unlessFlag: "projects" }, // a tab of the Inbox while that is on
    { label: "Projects", href: "/projects", flag: "projects" },
    { label: "Overview", href: "/overview", unlessFlag: "projects" },
    { label: "Explore", href: "/feed" },
  ],
};

/**
 * The tabs of the Projects area, shown in a strip under the bar. Each page in the area is named by its tab, so
 * no page repeats it as a title. `labelKey` is a message key; `roles`: only these roles see the tab.
 */
export type ProjectsTabKey = "overview" | "collaboration" | "progress";
export type ProjectsTabItem = {
  key: ProjectsTabKey; href: string; roles?: readonly Role[];
  labelKey: "shell.navOverview" | "shell.navCollaboration" | "shell.navProgress";
};
export const PROJECTS_TABS: ProjectsTabItem[] = [
  { key: "overview", labelKey: "shell.navOverview", href: "/projects" },
  { key: "collaboration", labelKey: "shell.navCollaboration", href: "/projects/collaboration" },
  { key: "progress", labelKey: "shell.navProgress", href: "/projects/progress" },
];

export function projectsTabsFor(role: Role): ProjectsTabItem[] {
  return PROJECTS_TABS.filter((tab) => !tab.roles || tab.roles.includes(role));
}

/** Which tab an address (relative to /[company]) is, or null outside the area: a project's own page has its own tabs. */
export function projectsTabAt(path: string): ProjectsTabKey | null {
  // Ideas are not part of Projects (Kevin and Sam, 16 Nov 2026): an idea's page (/idea, /cases/<id>) and the old ideas
  // table (/overview, which moves on to the Inbox while projects is on) are no tab here.
  return PROJECTS_TABS.find((tab) => tab.href === path)?.key ?? null;
}

/**
 * A section gets a strip of tabs under the bar when it has two or more real pages at the same level. Filters are not
 * tabs, and more than about six pages keep a side menu (Settings, the IT console). `needsServer`: the page needs the
 * database, so the offline demo has no such page.
 */
export type SectionKey = "projects" | "inbox" | "dashboard" | "profile" | "ideas";
export type SectionTabItem = {
  key: string; href: string; roles?: readonly Role[]; needsServer?: boolean;
  labelKey: ProjectsTabItem["labelKey"] | "shell.navInbox" | "decisions.tab" | "metrics.dashTitle" | "kpis.tab" | "shell.myProfile" | "shell.myReports" | "ideas.tabRaise" | "ideas.tabMine";
};
export const SECTION_TABS: Record<SectionKey, readonly SectionTabItem[]> = {
  projects: PROJECTS_TABS,
  // Where ideas are decided, and every yes and no so far (with projects on; without, Decisions has its own place in the bar).
  inbox: [
    { key: "inbox", labelKey: "shell.navInbox", href: "/inbox" },
    { key: "decisions", labelKey: "decisions.tab", href: "/decisions", roles: ["leader", "manager"] },
  ],
  dashboard: [
    { key: "ledger", labelKey: "metrics.dashTitle", href: "/dashboard" },
    { key: "kpis", labelKey: "kpis.tab", href: "/dashboard/kpis", roles: ["manager"], needsServer: true },
  ],
  profile: [
    { key: "profile", labelKey: "shell.myProfile", href: "/profile" },
    { key: "reports", labelKey: "shell.myReports", href: "/reports", needsServer: true },
  ],
  // The Ideas tab: raise one, and follow the ones I raised. Managers raise nothing, so they get neither. A member has both in
  // the bar (Raise, Progress), so a strip would only say them again (DESIGN_RULES 9, one name per place).
  ideas: [
    { key: "raise", labelKey: "ideas.tabRaise", href: "/raise", roles: ["leader"] },
    { key: "mine", labelKey: "ideas.tabMine", href: "/ideas", roles: ["leader"] },
  ],
};

/**
 * The sections whose pages sit in the area's side view (components/shell/AreaFrame.tsx) on a laptop or monitor, as the
 * Projects area has them: no strip of tabs under the bar repeats them there (Kevin, 16 Nov 2026: every area). A phone
 * keeps the strip. A section joins this list in the PR that moves its page's own list into the side view.
 */
export const SIDE_VIEW_SECTIONS: readonly SectionKey[] = [
  "dashboard",
  "profile",
  "inbox",
  "ideas",
];
export const hasSideView = (section: SectionKey): boolean => SIDE_VIEW_SECTIONS.includes(section);

/**
 * Pages of a side-view section that bring their own side view, so the shell does not wrap them in a second one (AreaFrame):
 * the raise page's sidebar is the Ideas side view, with the area's pages at its top (components/ideas/RaiseSidebar.tsx).
 */
export const OWN_SIDE_VIEW_PAGES: readonly string[] = [
  "/raise",
];
export const bringsOwnSideView = (path: string): boolean => OWN_SIDE_VIEW_PAGES.includes(path);

export function sectionTabsFor(section: SectionKey, who: { role: Role; serverMode: boolean }): SectionTabItem[] {
  return SECTION_TABS[section].filter((tab) => (!tab.roles || tab.roles.includes(who.role)) && (!tab.needsServer || who.serverMode));
}

/** Which section and tab an address (relative to /[company]) is. Null outside them, and when only one tab would show. */
export function sectionTabAt(path: string, who: { role: Role; serverMode: boolean; flag: (key: FlagKey) => boolean }): { section: SectionKey; tab: string } | null {
  const projects = who.flag("projects") ? projectsTabAt(path) : null;
  if (projects) return { section: "projects", tab: projects };
  if (who.flag("projects")) {
    const tab = SECTION_TABS.inbox.find((item) => item.href === path);
    if (tab) return sectionTabsFor("inbox", who).length > 1 ? { section: "inbox", tab: tab.key } : null;
  }
  for (const section of ["dashboard", "profile", "ideas"] as const) {
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

/**
 * The places the simple shell shows a role: flagged ones only while their flag is on, and an item with `hideWhenEmpty`
 * only while its count is above 0. `counts` are what the badges count (SimpleShell).
 */
export function visibleSimpleNav(role: Role, flag: (key: FlagKey) => boolean, counts: Record<"inbox" | "decisions", number>): SimpleNavItem[] {
  return simpleNavFor(role, flag).filter((n) => !n.hideWhenEmpty || (n.count !== undefined && counts[n.count] > 0));
}
