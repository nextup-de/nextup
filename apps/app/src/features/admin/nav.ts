// The admin sidebar. Pure, so the badge rules are unit-tested.
//
// /admin is six pages, not one long scroll: Overview, Requests, Companies, Knowledge, Decisions,
// Connections. Knowledge and Decisions are read-only views for the software team. The nav
// carries state, not just names - the badge is the answer, the link is only how you get to the
// detail. Connections folds the database, case notices, their tasks and mail into one badge:
// whichever is worst, because that is the one you are going there to fix.
import type { DatabaseState } from "./health";
import type { AutomationState } from "@/features/integrations/automation";
import type { TaskCounts } from "@/features/integrations/tasks";

export type Tone = "ok" | "warn" | "bad";

export type AdminPage = "overview" | "requests" | "companies" | "knowledge" | "decisions" | "connections";

export type NavItem = {
  id: AdminPage;
  label: string;
  /** Appended to the admin base ("/admin" in path mode, "" on the admin subdomain). */
  path: string;
  /** Short enough to sit in a pill, or null when there is nothing to say. */
  badge: string | null;
  tone: Tone | null;
};

/** "off" = not configured, "down" = configured and not answering, "up" = answering. */
export type MailState = "off" | "down" | "up";

export type NavFacts = {
  database: DatabaseState;
  openRequests: number;
  /** Open and past the two-working-day promise - features/admin/requests.ts. */
  overdueRequests: number;
  companies: number;
  automation: AutomationState | null;
  tasks: TaskCounts | null;
  mail: MailState;
};

/** Where /admin lives: "/admin" in path mode, the host root on the admin subdomain. */
export function adminBase(mode = process.env.TENANT_MODE): string {
  return mode === "subdomain" ? "" : "/admin";
}

export function adminNav(f: NavFacts): NavItem[] {
  return [
    { id: "overview", label: "Overview", path: "", badge: null, tone: null },
    { id: "requests", label: "Requests", path: "/requests", ...requestBadge(f.openRequests, f.overdueRequests) },
    { id: "companies", label: "Companies", path: "/companies", badge: String(f.companies), tone: null },
    // Read-only views for the software team. No badge: nothing on them needs anyone today.
    { id: "knowledge", label: "Knowledge", path: "/knowledge", badge: null, tone: null },
    { id: "decisions", label: "Decisions", path: "/decisions", badge: null, tone: null },
    { id: "connections", label: "Connections", path: "/connections", ...connectionBadge(f) },
  ];
}

function requestBadge(open: number, overdue: number): { badge: string | null; tone: Tone | null } {
  if (overdue > 0) return { badge: `${overdue} overdue`, tone: "bad" };
  if (open > 0) return { badge: String(open), tone: "warn" };
  return { badge: null, tone: null };
}

type Signal = { badge: string; tone: Tone };

/** Every connection problem, worst first. Empty means all green. */
export function connectionProblems(f: Pick<NavFacts, "database" | "automation" | "tasks" | "mail">): Signal[] {
  const bad: Signal[] = [];
  const warn: Signal[] = [];

  if (f.database === "down") bad.push({ badge: "db down", tone: "bad" });
  else if (f.database === "off") bad.push({ badge: "no db", tone: "bad" });

  if (f.tasks && f.tasks.failed > 0) bad.push({ badge: `${f.tasks.failed} stuck`, tone: "bad" });
  // Notices go out through the mail relay, so "unreachable" is the same fact as mail down - said once.
  if (f.automation === "off") warn.push({ badge: "notices off", tone: "warn" });
  else if (f.automation === "idle") warn.push({ badge: "notices idle", tone: "warn" });

  if (f.mail === "down") bad.push({ badge: "mail down", tone: "bad" });
  if (f.tasks && f.tasks.failed === 0 && f.tasks.pending > 0) warn.push({ badge: `${f.tasks.pending} sending`, tone: "warn" });

  return [...bad, ...warn];
}

function connectionBadge(f: NavFacts): { badge: string | null; tone: Tone | null } {
  const [worst] = connectionProblems(f);
  return worst ?? { badge: null, tone: "ok" };
}
