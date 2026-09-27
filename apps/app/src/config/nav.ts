import type { Role } from "./roles";

export type NavItem = { label: string; href: string; roles: readonly Role[] };

// Left rail. Filtered by role in the app shell layout. hrefs are relative to /[company].
export const NAV: NavItem[] = [
  { label: "Overview", href: "/manager", roles: ["manager"] },
  { label: "Inbox", href: "/leader", roles: ["leader", "manager"] },
  { label: "My cases", href: "/team", roles: ["member", "leader", "manager"] },
  { label: "Problems", href: "/problems", roles: ["member", "leader", "manager"] },
  { label: "Ideas", href: "/ideas", roles: ["member", "leader", "manager"] },
  { label: "Collaboration", href: "/collaboration", roles: ["member", "leader", "manager"] },
  { label: "Progress", href: "/progress", roles: ["member", "leader", "manager"] },
  { label: "Settings", href: "/settings", roles: ["manager"] },
];

// The simple shell (SHELL[role] === "simple"): two or three places and a profile button, per role.
// hrefs relative to /[company]. `count` names what the badge next to the label counts.
export type SimpleNavItem = { label: string; href: string; count?: "inbox" | "decisions" };
export const NAV_SIMPLE: Record<Role, SimpleNavItem[]> = {
  member: [
    { label: "Raise", href: "/raise" },
    { label: "Dashboard", href: "/dashboard" },
  ],
  leader: [
    { label: "Raise", href: "/raise" },
    { label: "Inbox", href: "/leader", count: "inbox" },
    { label: "Dashboard", href: "/dashboard" },
  ],
  manager: [
    { label: "Overview", href: "/manager", count: "decisions" },
    { label: "Inbox", href: "/leader", count: "inbox" }, // tentative: what sits on the manager's own desk (escalations, routes they own)
    { label: "Dashboard", href: "/dashboard" },
  ],
};

export function navFor(role: Role): NavItem[] {
  return NAV.filter((n) => n.roles.includes(role));
}
