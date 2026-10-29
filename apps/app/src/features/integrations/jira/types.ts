// The Jira contract (docs/plans/2026-10-29_jira-in-app.md): the shapes every part of the in-app
// Jira sync agrees on, so the engine, the admin page and the lead UI can be built apart.
// Types only - no logic, no node:*, no next/* - plus one small error class the client throws.
//
//   settings (Integration.settings)  ->  ./settings.ts parses and validates them
//   Job                              ->  what planPush() decides to do in Jira
//   JiraApi                          ->  the only way anything talks to Jira (server/jira/cloud.ts)
//   JiraIssue, JiraHistory, ...      ->  Jira's JSON as the pure pull code reads it
//   JiraStatusView                   ->  what the admin page and the lead UI show
//   TestJira                         ->  the admin "Test connection" (server/jira/test.ts)
import type { StepColumn } from "@/features/projects/types";

/** "dc" (Data Center) is a seam only: the settings accept it, nothing implements it yet. */
export type JiraFlavor = "cloud" | "dc";

/** The Jira status categories every Jira workflow maps its statuses onto. */
export type JiraCategory = "new" | "indeterminate" | "done";

/** The status category each NextUp column stands for. Blocked has no Jira twin: it shows as In Progress. */
export const CATEGORY_FOR: Readonly<Record<StepColumn, JiraCategory>> = {
  todo: "new", doing: "indeterminate", blocked: "indeterminate", done: "done",
};

/** Integration.settings for system "jira". Parsed by parseJiraSettings, never trusted as stored. */
export type JiraSettings = {
  flavor: JiraFlavor;
  /** The site, no trailing slash: "https://acme.atlassian.net". Issue links are built from it. */
  siteUrl: string;
  /** The integration account's email (Basic auth with the API token). Empty for "dc" (Bearer PAT). */
  email: string;
  /** The Jira project's key, "NUP". */
  projectKey: string;
  /** Issue type ids, not names: "Epic" is "Epos" on a German site. Digits only. */
  epicTypeId: string;
  stepTypeId: string;
  /** Create the epic when an idea decided "yes" after the integration was switched on. */
  autoEpic: boolean;
  /** An issue that appears under the epic in Jira becomes a step on the board. */
  pullNewIssues: boolean;
  /** Jira comments on the epic or a step's issue become project comments (cut to 2000, no author). */
  pullComments: boolean;
  /**
   * Overrides of the status a column moves an issue to: column -> Jira status id. Without one, the
   * sync picks a transition by status category (CATEGORY_FOR). Digits only.
   */
  statusFor?: Partial<Record<StepColumn, string>>;
};

/** The integration account Jira says it is signed in as (GET /myself). Echoes of it are skipped. */
export type JiraAccount = { id: string; name: string };

// ---- What the engine does in Jira ---------------------------------------------------------------

/**
 * One call-sequence planPush() asks for. Every job names the log event that caused it (`seq`), so the
 * runner can advance Integration.pushedSeq only past events whose jobs all succeeded. Jobs are
 * idempotent to repeat: creates look for the label first and adopt an issue that already exists.
 *
 * Labels: the epic carries `nextup-<projectId>`, a step's issue `nextup-step-<stepId>`, a removed
 * step's issue `nextup-removed`.
 */
export type Job =
  /** A synced project with no epic yet. After it, append project.linked {system:"jira", key, url}, idemKey. */
  | { kind: "epic"; seq: number; projectId: string; title: string; label: string; idemKey: string }
  /**
   * A step with no `external`. `epicKey` is the project's epic, or null while the epic is created
   * earlier in the same list (the runner passes the key it got). After it: project.linked with stepId.
   */
  | { kind: "issue"; seq: number; projectId: string; stepId: string; epicKey: string | null; summary: string; label: string; idemKey: string }
  /** A person moved a step: move its issue to the status of that column (statusFor, else by category). */
  | { kind: "transition"; seq: number; projectId: string; stepId: string; issueKey: string; to: StepColumn }
  /** A person edited a step's text: PUT the issue's summary. */
  | { kind: "summary"; seq: number; projectId: string; stepId: string; issueKey: string; summary: string }
  /** A person removed a step: a comment and the label `nextup-removed`. Never a delete. */
  | { kind: "remove"; seq: number; projectId: string; stepId: string; issueKey: string };

export type JobKind = Job["kind"];

// ---- Jira's JSON, as the pure pull code reads it -------------------------------------------------

export type JiraStatus = { id: string; name: string; statusCategory: { key: JiraCategory } };
export type JiraIssueType = { id: string; name: string; subtask?: boolean };
export type JiraUserRef = { accountId: string; displayName?: string };

export type JiraIssue = {
  id: string;
  key: string;
  fields: {
    summary: string;
    status: JiraStatus;
    issuetype: JiraIssueType;
    parent?: { key: string };
    labels?: string[];
    /** ISO 8601, as Jira writes it. */
    updated?: string;
  };
  /** Present when the search asked for expand=changelog. Oldest history first is NOT guaranteed. */
  changelog?: { histories: JiraHistory[] };
};

export type JiraHistory = {
  id: string;
  created: string;
  /** Absent for changes made by an automation or the system. */
  author?: JiraUserRef;
  items: { field: string; from: string | null; to: string | null; fromString: string | null; toString: string | null }[];
};

export type JiraComment = {
  id: string;
  author?: JiraUserRef;
  /** Atlassian Document Format on Cloud (v3), a plain string on Data Center (v2). */
  body: unknown;
  created: string;
  updated?: string;
};

export type JiraTransition = { id: string; name: string; to: JiraStatus };

/** What the integration account may do in the project (GET /mypermissions), for the connection test. */
export type JiraPermissions = { browse: boolean; create: boolean; edit: boolean; transition: boolean; comment: boolean };

export type JiraProjectInfo = { id: string; key: string; name: string };

// ---- The client -----------------------------------------------------------------------------------

/** A failed Jira call. `status` is the HTTP status (0 = no answer); 401 means the token has expired. */
export class JiraError extends Error {
  constructor(message: string, readonly status: number, readonly retryAfterMs: number | null = null) {
    super(message);
    this.name = "JiraError";
  }
}

/**
 * Everything the sync does in Jira, and nothing else. `server/jira/cloud.ts` implements it for Cloud
 * (API v3), `server/jira/dc.ts` will for Data Center (API v2), tests use a fake. Every method throws
 * JiraError on a failed call. Text is plain text in and out: the client converts to and from the
 * site's format (ADF on Cloud).
 */
export interface JiraApi {
  /** GET /myself: who the token belongs to. */
  myself(): Promise<JiraAccount>;
  /** The project, or null when it does not exist or the account cannot see it. */
  project(key: string): Promise<JiraProjectInfo | null>;
  /** The issue types a person may create in the project (createmeta), for the admin dropdowns. */
  issueTypes(projectKey: string): Promise<JiraIssueType[]>;
  /** GET /mypermissions for the project. */
  permissions(projectKey: string): Promise<JiraPermissions>;

  /** Every match of a JQL query, paging inside. `changelog` asks for expand=changelog. */
  search(jql: string, opts?: { changelog?: boolean }): Promise<JiraIssue[]>;
  /** One issue, or null when it is gone. */
  issue(key: string, opts?: { changelog?: boolean }): Promise<JiraIssue | null>;
  /** Comments on an issue, newest last. */
  comments(key: string): Promise<JiraComment[]>;

  /** Create an issue (an epic when `parentKey` is null and the type is the epic type). */
  createIssue(p: { typeId: string; summary: string; parentKey: string | null; labels: string[] }): Promise<{ id: string; key: string }>;
  setSummary(key: string, summary: string): Promise<void>;
  addLabel(key: string, label: string): Promise<void>;
  addComment(key: string, text: string): Promise<void>;
  /** The moves open from the issue's current status. */
  transitions(key: string): Promise<JiraTransition[]>;
  transition(key: string, transitionId: string): Promise<void>;
}

/** Builds the client for a company's settings and its plain (opened) token. */
export type JiraApiFactory = (settings: JiraSettings, token: string) => JiraApi;

// ---- The connection test --------------------------------------------------------------------------

export type JiraCheck = { id: "auth" | "project" | "types" | "permissions" | "labels"; ok: boolean; label: string; detail: string };

export type JiraTestResult = {
  /** True when every check passed. */
  ok: boolean;
  checks: JiraCheck[];
  /** Who the token belongs to (null when authentication failed). */
  account: JiraAccount | null;
  /** The project's issue types, for the epic and step dropdowns (empty when the project could not be read). */
  issueTypes: JiraIssueType[];
};

/**
 * The admin's "Test connection" (server/jira/test.ts): `/myself`, the project, the issue types,
 * `/mypermissions` (browse, create, edit, transition, comment) and whether labels can be set.
 * Never throws for a refused call - that is a failed check with its reason. `api` defaults to the
 * real client for the flavor; tests pass a fake.
 */
export type TestJira = (settings: JiraSettings, token: string, api?: JiraApi) => Promise<JiraTestResult>;

// ---- What the screens show ------------------------------------------------------------------------

/** A step (or project) the sync could not do something for, shown in the admin status. Computed from the log, not stored. */
export type JiraProblem = { projectId: string; stepId: string | null; message: string };

/**
 * The state of a company's Jira integration for the admin page and (as a summary) the lead UI. Plain
 * values only - dates are ISO strings - so it crosses the server/client boundary. Built by
 * jiraStatusView() from the Integration row; `linked` and `problems` need the log and are added by
 * whoever has it.
 */
export type JiraStatusView = {
  /** Is there a row with valid settings and a token? Without it nothing can be switched on. */
  configured: boolean;
  on: boolean;
  /** When it was last switched on: only ideas decided after this get an epic by themselves. */
  enabledAt: string | null;
  siteUrl: string | null;
  projectKey: string | null;
  hasToken: boolean;
  hasWebhookSecret: boolean;
  account: JiraAccount | null;
  lastRunAt: string | null;
  lastOkAt: string | null;
  /** Why the last round failed, or null. "401 ..." means the token has expired. */
  lastError: string | null;
  /** True when lastError says the token was refused: the admin has to enter a new one. */
  tokenExpired: boolean;
  /** Projects and steps that have a Jira twin. Null until the log is read. */
  linked: { projects: number; steps: number } | null;
  problems: JiraProblem[];
};
