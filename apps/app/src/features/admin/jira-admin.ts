// The pure pieces of /admin/integrations (docs/plans/2026-10-29_jira-in-app.md, "Admin page"): the
// form's values -> JiraSettings, the webhook address, what "linked" and "problems" mean, and how a
// time reads. No next/*, no database - the actions and the page call these.
import { STEP_COLUMNS, type ReducedProject, type StepColumn } from "@/features/projects/types";
import { parseJiraSettings, type JiraSettingsResult } from "@/features/integrations/jira/settings";
import { syncMode } from "@/features/integrations/jira/map";
import { isTokenError } from "@/features/integrations/jira/view";
import type { JiraIssueType, JiraProblem, JiraStatusView } from "@/features/integrations/jira/types";

/** What the page sends. The token is the only secret: empty means "keep the one that is saved". */
export type JiraForm = {
  flavor: string;
  siteUrl: string;
  email: string;
  token: string;
  projectKey: string;
  epicTypeId: string;
  stepTypeId: string;
  autoEpic: boolean;
  pullNewIssues: boolean;
  pullComments: boolean;
  /** Column -> Jira status id; empty = pick the transition by status category. */
  statusFor: Record<StepColumn, string>;
};

export const emptyStatusFor = (): Record<StepColumn, string> => ({ todo: "", doing: "", blocked: "", done: "" });

const str = (v: unknown, max = 300): string => (typeof v === "string" ? v.slice(0, max) : "");

/** Read what a client sent. Anything of the wrong type becomes empty or false; the settings parser has the final say. */
export function readJiraForm(raw: unknown): JiraForm {
  const r = typeof raw === "object" && raw !== null ? (raw as Record<string, unknown>) : {};
  const sf = typeof r.statusFor === "object" && r.statusFor !== null ? (r.statusFor as Record<string, unknown>) : {};
  const statusFor = emptyStatusFor();
  for (const c of STEP_COLUMNS) statusFor[c] = str(sf[c], 20).trim();
  return {
    flavor: str(r.flavor, 10) || "cloud",
    siteUrl: str(r.siteUrl), email: str(r.email, 200), token: str(r.token, 500).trim(),
    projectKey: str(r.projectKey, 20), epicTypeId: str(r.epicTypeId, 20), stepTypeId: str(r.stepTypeId, 20),
    autoEpic: r.autoEpic === true, pullNewIssues: r.pullNewIssues === true, pullComments: r.pullComments === true,
    statusFor,
  };
}

/**
 * The form as JiraSettings. `forTest` fills a missing issue type with "0": the connection test is what
 * fetches the types, so it must be runnable before they are chosen. Data Center is a seam only.
 */
export function settingsFromForm(f: JiraForm, opts: { forTest?: boolean } = {}): JiraSettingsResult {
  if (f.flavor !== "cloud") return { ok: false, errors: ["Data Center is not available yet - only Jira Cloud."] };
  const fill = (id: string) => (opts.forTest && !id.trim() ? "0" : id);
  return parseJiraSettings({
    flavor: f.flavor, siteUrl: f.siteUrl, email: f.email, projectKey: f.projectKey,
    epicTypeId: fill(f.epicTypeId), stepTypeId: fill(f.stepTypeId),
    autoEpic: f.autoEpic, pullNewIssues: f.pullNewIssues, pullComments: f.pullComments,
    statusFor: f.statusFor,
  });
}

/** The form's starting values from saved settings (a row that does not parse gives the defaults). */
export function formFromSettings(raw: unknown): Omit<JiraForm, "token"> {
  const parsed = parseJiraSettings(raw);
  const base = { flavor: "cloud", siteUrl: "", email: "", projectKey: "", epicTypeId: "", stepTypeId: "", autoEpic: true, pullNewIssues: false, pullComments: true, statusFor: emptyStatusFor() };
  if (!parsed.ok) {
    // Keep what can be kept of a half-saved row, so the admin corrects it instead of retyping it.
    const r = typeof raw === "object" && raw !== null ? (raw as Record<string, unknown>) : {};
    return { ...base, siteUrl: str(r.siteUrl), email: str(r.email, 200), projectKey: str(r.projectKey, 20) };
  }
  const s = parsed.settings;
  const statusFor = emptyStatusFor();
  for (const c of STEP_COLUMNS) statusFor[c] = s.statusFor?.[c] ?? "";
  return {
    flavor: s.flavor, siteUrl: s.siteUrl, email: s.email, projectKey: s.projectKey,
    epicTypeId: s.epicTypeId, stepTypeId: s.stepTypeId,
    autoEpic: s.autoEpic, pullNewIssues: s.pullNewIssues, pullComments: s.pullComments, statusFor,
  };
}

/**
 * Which issue types to preselect after a test: the epic type by its name (Epic, Epos, Épopée), and for
 * steps the first ordinary type that is neither the epic nor a sub-task (Task, Aufgabe, ...).
 * Only a suggestion - the admin picks.
 */
export function suggestTypes(types: readonly JiraIssueType[]): { epicTypeId: string; stepTypeId: string } {
  const epic = types.find((t) => /^(epic|epos|épopée|epica|épica)$/i.test(t.name.trim()));
  const plain = types.filter((t) => !t.subtask && t.id !== epic?.id);
  const task = plain.find((t) => /^(task|aufgabe|tâche|tarea|tarefa)$/i.test(t.name.trim())) ?? plain[0];
  return { epicTypeId: epic?.id ?? "", stepTypeId: task?.id ?? "" };
}

/** Where Jira's admin webhook should post: `<origin>/api/<company>/integrations/jira/webhook`. */
export function jiraWebhookUrl(origin: string, slug: string): string {
  return `${origin.replace(/\/+$/, "")}/api/${encodeURIComponent(slug)}/integrations/jira/webhook`;
}

// ---- What the log says about the sync ------------------------------------------------------------

const isJira = (system: string | undefined): boolean => system === "jira";

/** What the engine needs to decide whether it creates things for a project (see syncMode). */
export type SyncRules = { autoEpic: boolean; enabledAt: number | null };

type SummaryProject = Pick<ReducedProject, "id" | "title" | "sync" | "links" | "status" | "steps" | "seed" | "history">;

/**
 * Will the sync create an epic and issues for this project? The same question the engine asks
 * (syncMode): a project sent to Jira, or an idea decided yes after the integration was switched on.
 * A project that only carries links (demo data, issues twinned by hand) is never filled in.
 */
export function isSynced(p: SummaryProject, rules: SyncRules): boolean {
  if (p.status === "stopped") return false;
  return syncMode(p as ReducedProject, rules, rules.enabledAt) === "sync";
}

/**
 * How many projects and steps have a Jira twin, and what is still missing a twin: a project the sync
 * will fill in that has no epic, a step of one that has no issue. Each of those is "waiting" when the
 * sync is healthy and a problem when its last round failed - the page decides how to say it. Projects
 * the engine leaves alone are not listed: nothing is coming for them.
 */
export function jiraLinkSummary(projects: readonly SummaryProject[], rules: SyncRules): {
  linked: { projects: number; steps: number };
  problems: JiraProblem[];
} {
  let linkedProjects = 0;
  let linkedSteps = 0;
  const problems: JiraProblem[] = [];
  for (const p of projects) {
    const epic = p.links.some((l) => isJira(l.system) && l.stepId === null);
    if (epic) linkedProjects += 1;
    for (const s of p.steps) if (isJira(s.external?.system)) linkedSteps += 1;
    if (!isSynced(p, rules)) continue;
    if (!epic) problems.push({ projectId: p.id, stepId: null, message: `"${p.title}" has no epic in Jira yet.` });
    for (const s of p.steps) {
      if (!s.external) problems.push({ projectId: p.id, stepId: s.id, message: `Step "${s.text}" of "${p.title}" has no issue in Jira yet.` });
    }
  }
  return { linked: { projects: linkedProjects, steps: linkedSteps }, problems };
}

// ---- How the status reads ------------------------------------------------------------------------

/** "just now", "3 min ago", "2 h ago", or the date - for a time the server rendered against `now`. */
export function ago(iso: string | null, now: Date): string {
  if (!iso) return "never";
  const t = new Date(iso).getTime();
  if (Number.isNaN(t)) return "never";
  const s = Math.max(0, Math.round((now.getTime() - t) / 1000));
  if (s < 60) return "just now";
  if (s < 3600) return `${Math.floor(s / 60)} min ago`;
  if (s < 86400) return `${Math.floor(s / 3600)} h ago`;
  return iso.slice(0, 10);
}

export type JiraHeadline = { tone: "ok" | "warn" | "bad" | "off"; text: string };

/** The one line over the status: is it running, and if not, why. A refused token is said in words, not as "401". */
export function jiraHeadline(v: Pick<JiraStatusView, "configured" | "on" | "lastError" | "tokenExpired" | "lastOkAt">, now: Date): JiraHeadline {
  if (!v.configured) return { tone: "off", text: "Not set up yet." };
  if (v.on && v.lastError) {
    return v.tokenExpired
      ? { tone: "bad", text: "Token expired - Jira refused it. Enter a new API token and save." }
      : { tone: "warn", text: `Last round failed: ${v.lastError}` };
  }
  if (v.on) return { tone: "ok", text: v.lastOkAt ? `Syncing. Last good round ${ago(v.lastOkAt, now)}.` : "Switched on. The first round runs within a minute." };
  return { tone: "off", text: "Set up, switched off." };
}

/** Whether a stored lastError means the token was refused (the same rule the nav badge and the headline use). */
export const tokenRefused = isTokenError;
