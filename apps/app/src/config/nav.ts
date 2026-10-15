import type { FlagKey } from "./flags";
import type { Role } from "./roles";

// `flag`: shown only while that feature flag is on for the company (config/flags.ts).
export type NavItem = { label: string; href: string; roles: readonly Role[]; flag?: FlagKey };

// Left rail. Filtered by role in the app shell layout. hrefs are relative to /[company].
export const NAV: NavItem[] = [
  { label: "Dashboard", href: "/dashboard", roles: ["manager"] },
  { label: "Inbox", href: "/leader", roles: ["leader", "manager"] },
  { label: "My cases", href: "/team", roles: ["member", "leader", "manager"] },
  { label: "Problems", href: "/problems", roles: ["member", "leader", "manager"] },
  { label: "Ideas", href: "/ideas", roles: ["member", "leader", "manager"] },
  { label: "Feed", href: "/feed", roles: ["member", "leader", "manager"] },
  { label: "Collaboration", href: "/collaboration", roles: ["member", "leader", "manager"] },
  { label: "Projects", href: "/projects", roles: ["member", "leader", "manager"], flag: "projects" },
  { label: "Progress", href: "/progress", roles: ["member", "leader", "manager"] },
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
    { label: "Projects", href: "/projects", flag: "projects" },
    { label: "Overview", href: "/overview", unlessFlag: "projects" },
  ],
  manager: [
    { label: "Dashboard", href: "/dashboard" },
    { label: "Inbox", href: "/leader", count: "inbox" }, // tentative: what sits on the manager's own desk (escalations, routes they own)
    { label: "Feed", href: "/feed" },
    { label: "Projects", href: "/projects", flag: "projects" },
    { label: "Overview", href: "/overview", unlessFlag: "projects" },
  ],
};

/** The rail for a role; `flag` answers whether a flagged item is on (DemoProvider's flag()). */
export function navFor(role: Role, flag: (key: FlagKey) => boolean = () => true): NavItem[] {
  return NAV.filter((n) => n.roles.includes(role) && (!n.flag || flag(n.flag)));
}

/** The simple shell's places for a role, flagged ones only while their flag is on. */
export function simpleNavFor(role: Role, flag: (key: FlagKey) => boolean): SimpleNavItem[] {
  return NAV_SIMPLE[role].filter((n) => (!n.flag || flag(n.flag)) && (!n.unlessFlag || !flag(n.unlessFlag)));
}
