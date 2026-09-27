// The three roles. Names match the URL segments so the role router is trivial.
export const ROLES = ["manager", "leader", "member"] as const;
export type Role = (typeof ROLES)[number];

// Where each role lands after login (relative to /[company]).
export const ROLE_HOME: Record<Role, string> = {
  manager: "/manager", // Overview
  leader: "/leader", // Inbox
  member: "/raise", // Raise a problem or an idea
};

// Which chrome a role gets. "simple" = logo + two or three places + profile, nothing else;
// "rail" = the full left rail + top bar (kept for the wider app, not used in the demo).
export type Shell = "simple" | "rail";
export const SHELL: Record<Role, Shell> = { manager: "simple", leader: "simple", member: "simple" };

// Who may open what. Path prefixes relative to /[company]. Anything not listed = any signed-in role.
export const ROLE_ACCESS: Record<string, readonly Role[]> = {
  "/manager": ["manager"],
  "/settings": ["manager"],
  "/leader": ["leader", "manager"],
};

export function canAccess(role: Role, path: string): boolean {
  const rule = Object.entries(ROLE_ACCESS).find(([prefix]) => path === prefix || path.startsWith(prefix + "/"));
  return rule ? rule[1].includes(role) : true;
}
