// The Jira Cloud client (REST API v3, Basic auth: the integration account's email plus an API
// token). Implements JiraApi (features/integrations/jira/types.ts) and nothing else talks to Jira.
// A failed call throws JiraError whose message starts with the HTTP status ("401 Unauthorized"), so
// Integration.lastError tells the admin an expired token at a glance (isTokenError).
// Not a "use server" module.
import { adfToText, textToAdf } from "@/features/integrations/jira/adf";
import {
  JiraError,
  type JiraApi,
  type JiraApiFactory,
  type JiraComment,
  type JiraIssue,
  type JiraIssueType,
  type JiraPermissions,
  type JiraProjectInfo,
  type JiraTransition,
} from "@/features/integrations/jira/types";

const TIMEOUT_MS = 20_000;
/** A 429 that asks for a short wait is waited out once; a longer one ends the round (the runner backs off). */
const MAX_INLINE_WAIT_MS = 5_000;
const PAGE = 100;
const MAX_PAGES = 20;
const FIELDS = ["summary", "status", "issuetype", "parent", "labels", "updated"];

type Fetch = typeof fetch;
type Opts = { fetch?: Fetch; sleep?: (ms: number) => Promise<void> };

const wait = (ms: number) => new Promise<void>((r) => setTimeout(r, ms));
const record = (v: unknown): Record<string, unknown> => (typeof v === "object" && v !== null ? (v as Record<string, unknown>) : {});

/** Jira's own words for what went wrong, short, for the error line. */
function reasonOf(body: unknown): string {
  const b = record(body);
  const msgs = Array.isArray(b.errorMessages) ? b.errorMessages.filter((m): m is string => typeof m === "string") : [];
  const fields = Object.values(record(b.errors)).filter((m): m is string => typeof m === "string");
  return [...msgs, ...fields].join("; ").slice(0, 200);
}

function retryAfterOf(res: Response): number | null {
  const raw = res.headers.get("retry-after");
  const s = raw === null ? NaN : Number(raw);
  return Number.isFinite(s) && s >= 0 ? Math.ceil(s * 1000) : null;
}

export function createCloudApi(
  s: { siteUrl: string; email: string; projectKey: string },
  token: string,
  opts: Opts = {},
): JiraApi {
  const doFetch = opts.fetch ?? fetch;
  const sleep = opts.sleep ?? wait;
  const auth = "Basic " + Buffer.from(`${s.email}:${token}`).toString("base64");
  const base = `${s.siteUrl}/rest/api/3`;

  /** One call. `allow404` turns a missing thing into null. */
  async function call(method: string, path: string, body?: unknown, allow404 = false): Promise<unknown> {
    for (let attempt = 0; ; attempt++) {
      let res: Response;
      try {
        res = await doFetch(base + path, {
          method,
          headers: { authorization: auth, accept: "application/json", ...(body !== undefined ? { "content-type": "application/json" } : {}) },
          body: body !== undefined ? JSON.stringify(body) : undefined,
          cache: "no-store",
          signal: AbortSignal.timeout(TIMEOUT_MS),
        });
      } catch (e) {
        throw new JiraError(`0 No answer from ${new URL(s.siteUrl).host}: ${e instanceof Error ? e.message : String(e)}`.slice(0, 300), 0);
      }
      if (res.status === 429) {
        const after = retryAfterOf(res);
        if (attempt === 0 && after !== null && after <= MAX_INLINE_WAIT_MS) {
          await sleep(after);
          continue;
        }
        throw new JiraError("429 Too Many Requests: Jira asked us to slow down", 429, after ?? 60_000);
      }
      if (res.status === 404 && allow404) return null;
      const text = await res.text();
      let json: unknown = null;
      try {
        json = text ? JSON.parse(text) : null;
      } catch {
        json = null;
      }
      if (!res.ok) {
        const why = reasonOf(json);
        throw new JiraError(`${res.status} ${res.statusText || "Error"}${why ? ": " + why : ""}`.slice(0, 300), res.status);
      }
      return json;
    }
  }

  const enc = encodeURIComponent;
  const issueOf = (raw: unknown): JiraIssue => raw as JiraIssue;

  return {
    async myself() {
      const r = record(await call("GET", "/myself"));
      if (typeof r.accountId !== "string") throw new JiraError("502 Jira did not say who the token belongs to", 502);
      return { id: r.accountId, name: typeof r.displayName === "string" ? r.displayName : r.accountId };
    },

    async project(key): Promise<JiraProjectInfo | null> {
      const r = record(await call("GET", `/project/${enc(key)}`, undefined, true));
      return typeof r.key === "string" ? { id: String(r.id ?? ""), key: r.key, name: typeof r.name === "string" ? r.name : r.key } : null;
    },

    async issueTypes(projectKey): Promise<JiraIssueType[]> {
      const pick = (list: unknown): JiraIssueType[] =>
        (Array.isArray(list) ? list : []).flatMap((t) => {
          const x = record(t);
          return typeof x.id === "string" && typeof x.name === "string" ? [{ id: x.id, name: x.name, subtask: x.subtask === true }] : [];
        });
      try {
        const r = record(await call("GET", `/issue/createmeta/${enc(projectKey)}/issuetypes`));
        const types = pick(r.issueTypes ?? r.values);
        if (types.length) return types;
      } catch (e) {
        if (!(e instanceof JiraError) || e.status === 401 || e.status === 429) throw e;
      }
      // Older sites and restricted accounts: the project itself lists its types.
      return pick(record(await call("GET", `/project/${enc(projectKey)}`)).issueTypes);
    },

    async permissions(projectKey): Promise<JiraPermissions> {
      const names = ["BROWSE_PROJECTS", "CREATE_ISSUES", "EDIT_ISSUES", "TRANSITION_ISSUES", "ADD_COMMENTS"];
      const r = record(record(await call("GET", `/mypermissions?projectKey=${enc(projectKey)}&permissions=${names.join(",")}`)).permissions);
      const has = (n: string) => record(r[n]).havePermission === true;
      return { browse: has(names[0]), create: has(names[1]), edit: has(names[2]), transition: has(names[3]), comment: has(names[4]) };
    },

    async search(jql, o) {
      const out: JiraIssue[] = [];
      let nextPageToken: string | undefined;
      for (let page = 0; page < MAX_PAGES; page++) {
        const r = record(
          await call("POST", "/search/jql", {
            jql, maxResults: PAGE, fields: FIELDS, ...(o?.changelog ? { expand: "changelog" } : {}), ...(nextPageToken ? { nextPageToken } : {}),
          }),
        );
        for (const i of Array.isArray(r.issues) ? r.issues : []) out.push(issueOf(i));
        if (typeof r.nextPageToken !== "string" || r.isLast === true) break;
        nextPageToken = r.nextPageToken;
      }
      return out;
    },

    async issue(key, o) {
      const q = `fields=${FIELDS.join(",")}${o?.changelog ? "&expand=changelog" : ""}`;
      const r = await call("GET", `/issue/${enc(key)}?${q}`, undefined, true);
      return r === null ? null : issueOf(r);
    },

    async comments(key): Promise<JiraComment[]> {
      const out: JiraComment[] = [];
      for (let page = 0; page < MAX_PAGES; page++) {
        const r = record(await call("GET", `/issue/${enc(key)}/comment?startAt=${page * PAGE}&maxResults=${PAGE}&orderBy=created`));
        const list = Array.isArray(r.comments) ? r.comments : [];
        out.push(...(list as JiraComment[]));
        if (list.length < PAGE) break;
      }
      return out;
    },

    async createIssue(p) {
      const r = record(
        await call("POST", "/issue", {
          fields: {
            project: { key: s.projectKey }, issuetype: { id: p.typeId }, summary: p.summary, labels: p.labels,
            ...(p.parentKey ? { parent: { key: p.parentKey } } : {}),
          },
        }),
      );
      if (typeof r.key !== "string") throw new JiraError("502 Jira did not return the new issue's key", 502);
      return { id: String(r.id ?? ""), key: r.key };
    },

    async setSummary(key, summary) {
      await call("PUT", `/issue/${enc(key)}`, { fields: { summary } });
    },

    async addLabel(key, label) {
      await call("PUT", `/issue/${enc(key)}`, { update: { labels: [{ add: label }] } });
    },

    async addComment(key, text) {
      await call("POST", `/issue/${enc(key)}/comment`, { body: textToAdf(text) });
    },

    async transitions(key): Promise<JiraTransition[]> {
      const r = record(await call("GET", `/issue/${enc(key)}/transitions`));
      return (Array.isArray(r.transitions) ? r.transitions : []) as JiraTransition[];
    },

    async transition(key, transitionId) {
      await call("POST", `/issue/${enc(key)}/transitions`, { transition: { id: transitionId } });
    },
  };
}

/** Plain text of a Jira comment body, for the pull code. */
export const commentText = (c: JiraComment): string => adfToText(c.body);

export const cloudApi: JiraApiFactory = (settings, token) => createCloudApi(settings, token);
