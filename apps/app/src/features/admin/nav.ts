// The console sidebar (ITC/D3). Pure, so the badge rules are unit-tested. The app keeps no platform
// admin (ITC/D5): companies, requests, tickets and connections live on admin.sellux.ch.
import type { MessageKey } from "@/i18n";
import type { CompanyRow } from "./rows";

export type Tone = "ok" | "warn" | "bad";

export type AdminPage =
  | "overview"
  | "people"
  | "access"
  | "connectors"
  | "routing"
  | "support"
  | "assistant"
  | "integrations"
  | "data";

/**
 * The company's IT and privacy console (ITC/D3): the sections of /admin in a one-company stack, in this
 * order. `path` is the full path, `labelKey` a key of the `adminConsole` namespace. A section whose page
 * has not landed yet still shows and answers 404 until it does.
 */
export const CONSOLE_SECTIONS = [
  { key: "overview", path: "/admin", labelKey: "adminConsole.sectionOverview" },
  { key: "access", path: "/admin/people", labelKey: "adminConsole.sectionAccess" },
  { key: "connectors", path: "/admin/connectors", labelKey: "adminConsole.sectionConnectors" },
  { key: "assistant", path: "/admin/assistant", labelKey: "adminConsole.sectionAssistant" },
  { key: "data", path: "/admin/company-data", labelKey: "adminConsole.sectionData" },
  { key: "routing", path: "/admin/decisions", labelKey: "adminConsole.sectionRouting" },
  { key: "support", path: "/admin/support", labelKey: "adminConsole.sectionSupport" },
] as const satisfies readonly { key: AdminPage; path: string; labelKey: MessageKey }[];

export type ConsoleSection = (typeof CONSOLE_SECTIONS)[number];

/** The console sidebar: one item per section; Access speaks up when someone cannot sign in. */
export function consoleNav(label: (key: MessageKey) => string, f: Pick<CompanyNavFacts, "locked">): NavItem[] {
  return CONSOLE_SECTIONS.map((s) => ({
    id: s.key,
    label: label(s.labelKey),
    path: s.path === "/admin" ? "" : s.path.slice("/admin".length),
    badge: s.key === "access" && f.locked ? String(f.locked) : null,
    tone: s.key === "access" && f.locked ? ("warn" as const) : null,
  }));
}

export type NavItem = {
  id: AdminPage;
  label: string;
  /** Appended to the admin base ("/admin" in path mode, "" on the admin subdomain). */
  path: string;
  /** Short enough to sit in a pill, or null when there is nothing to say. */
  badge: string | null;
  tone: Tone | null;
};

/** Where /admin lives: "/admin" in path mode, the host root on the admin subdomain. */
export function adminBase(mode = process.env.TENANT_MODE): string {
  return mode === "subdomain" ? "" : "/admin";
}

/** What the Integrations badge needs of the Jira row: is it running, did the last round fail, was the token refused. */
export type JiraNavFacts = { on: boolean; failing: boolean; tokenExpired: boolean };

export type CompanyNavFacts = {
  people: number;
  /** People who have neither a login code nor a Microsoft account bound - they cannot get in. */
  locked: number;
  /** The Jira integration, or null/absent when nothing was saved or the database did not answer. */
  jira?: JiraNavFacts | null;
};

/** Nobody can get in: no login code, and no Microsoft account the company's tenant still lets in. */
export function lockedOut(company: Pick<CompanyRow, "persons" | "entraTenantId">): CompanyRow["persons"] {
  return company.persons.filter((p) => !p.codeIssuedAt && !(p.microsoft && company.entraTenantId));
}

/** Quiet while Jira is off or fine; "token expired" and "sync error" are the two things an admin has to act on. */
export function jiraBadge(j: JiraNavFacts | null | undefined): { badge: string | null; tone: Tone | null } {
  if (!j || !j.on || !j.failing) return { badge: null, tone: null };
  return j.tokenExpired ? { badge: "token expired", tone: "bad" } : { badge: "sync error", tone: "warn" };
}
