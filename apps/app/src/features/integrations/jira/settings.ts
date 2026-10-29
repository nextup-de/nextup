// Parse and check a company's Jira settings (Integration.settings, system "jira"). Pure: the stored
// JSON or an admin's form in, a JiraSettings or a list of what is wrong out. The admin page shows
// the errors as they are, so each one names its field.
import { STEP_COLUMNS } from "@/features/projects/types";
import type { JiraFlavor, JiraSettings } from "./types";

export const JIRA_FLAVORS: readonly JiraFlavor[] = ["cloud", "dc"];

/** What a switch is when the form leaves it out. An epic by itself is what Kevin decided on 29 Oct 2026. */
export const JIRA_TOGGLE_DEFAULTS = { autoEpic: true, pullNewIssues: false, pullComments: true } as const;

const KEY = /^[A-Z][A-Z0-9_]{1,9}$/;
const ID = /^\d{1,12}$/;
const EMAIL = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

/** Plain http is for the machine you are on (the fake Jira in the tests); a real site is https. */
const LOCAL_HOSTS = new Set(["localhost", "127.0.0.1", "[::1]"]);

/** The site as `https://host[:port][/context]` without a trailing slash, or null when it is not one. */
export function normalizeSiteUrl(raw: unknown): string | null {
  if (typeof raw !== "string" || raw.length > 300) return null;
  let u: URL;
  try {
    u = new URL(raw.trim());
  } catch {
    return null;
  }
  if (u.username || u.password || u.search || u.hash) return null;
  if (u.protocol !== "https:" && !(u.protocol === "http:" && LOCAL_HOSTS.has(u.hostname))) return null;
  return u.origin + u.pathname.replace(/\/+$/, "");
}

export type JiraSettingsResult = { ok: true; settings: JiraSettings } | { ok: false; errors: string[] };

/** Check a value that claims to be JiraSettings. Unknown fields are dropped, a missing switch takes its default. */
export function parseJiraSettings(raw: unknown): JiraSettingsResult {
  if (typeof raw !== "object" || raw === null || Array.isArray(raw)) return { ok: false, errors: ["The settings must be an object."] };
  const r = raw as Record<string, unknown>;
  const errors: string[] = [];

  const flavor = r.flavor === undefined ? "cloud" : r.flavor;
  if (!JIRA_FLAVORS.includes(flavor as JiraFlavor)) errors.push('flavor must be "cloud" or "dc".');

  const siteUrl = normalizeSiteUrl(r.siteUrl);
  if (!siteUrl) errors.push("siteUrl must be the address of the Jira site, https://…");

  const email = typeof r.email === "string" ? r.email.trim() : "";
  if (flavor !== "dc" && !EMAIL.test(email)) errors.push("email must be the integration account's email address.");
  if (email.length > 200) errors.push("email is too long.");

  const projectKey = typeof r.projectKey === "string" ? r.projectKey.trim().toUpperCase() : "";
  if (!KEY.test(projectKey)) errors.push("projectKey must be the Jira project's key, for example NUP.");

  const epicTypeId = typeof r.epicTypeId === "string" ? r.epicTypeId.trim() : "";
  if (!ID.test(epicTypeId)) errors.push("epicTypeId must be the id of the epic issue type (digits).");
  const stepTypeId = typeof r.stepTypeId === "string" ? r.stepTypeId.trim() : "";
  if (!ID.test(stepTypeId)) errors.push("stepTypeId must be the id of the issue type for steps (digits).");

  const toggle = (name: keyof typeof JIRA_TOGGLE_DEFAULTS): boolean => {
    const v = r[name];
    if (v === undefined) return JIRA_TOGGLE_DEFAULTS[name];
    if (typeof v !== "boolean") errors.push(`${name} must be true or false.`);
    return v === true;
  };
  const autoEpic = toggle("autoEpic");
  const pullNewIssues = toggle("pullNewIssues");
  const pullComments = toggle("pullComments");

  let statusFor: JiraSettings["statusFor"];
  if (r.statusFor !== undefined && r.statusFor !== null) {
    const s = r.statusFor;
    if (typeof s !== "object" || Array.isArray(s)) errors.push("statusFor must map a column to a Jira status id.");
    else {
      const found: NonNullable<JiraSettings["statusFor"]> = {};
      for (const [col, id] of Object.entries(s)) {
        if (!(STEP_COLUMNS as readonly string[]).includes(col)) errors.push(`statusFor has no column "${col}".`);
        else if (id === "" || id === null) continue; // an empty row in the form means "by category"
        else if (typeof id !== "string" || !ID.test(id)) errors.push(`statusFor.${col} must be a Jira status id (digits).`);
        else found[col as keyof typeof found] = id;
      }
      if (Object.keys(found).length) statusFor = found;
    }
  }

  if (errors.length || !siteUrl) return { ok: false, errors };
  return {
    ok: true,
    settings: {
      flavor: flavor as JiraFlavor, siteUrl, email, projectKey, epicTypeId, stepTypeId,
      autoEpic, pullNewIssues, pullComments, ...(statusFor ? { statusFor } : {}),
    },
  };
}

/** The address of an issue on the site, for project.linked { url }: https://acme.atlassian.net/browse/NUP-1 */
export const jiraIssueUrl = (s: Pick<JiraSettings, "siteUrl">, key: string): string => `${s.siteUrl}/browse/${encodeURIComponent(key)}`;

/** Is this a Jira issue key ("NUP-12")? What a lead types into "link an existing issue". */
export const isIssueKey = (v: unknown): v is string => typeof v === "string" && /^[A-Z][A-Z0-9_]{1,9}-\d{1,9}$/.test(v);

/** The label an epic carries, and the one a step's issue carries (the repeat-safe way to find them). */
export const epicLabel = (projectId: string): string => `nextup-${projectId}`;
export const stepLabel = (stepId: string): string => `nextup-step-${stepId}`;
export const REMOVED_LABEL = "nextup-removed";
