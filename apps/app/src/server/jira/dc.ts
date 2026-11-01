// The Jira Data Center client (9.x, REST API v2, Authorization: Bearer <personal access token>).
// Implements JiraApi (features/integrations/jira/types.ts), the twin of cloud.ts: plain-text bodies
// (no ADF), search with GET and startAt paging, and people identified by `key` (Data Center has no
// accountId), so JiraAccount.id and JiraUserRef.accountId carry the user's key.
// A failed call throws JiraError whose message starts with the HTTP status ("401 Unauthorized"), so
// Integration.lastError tells the admin an expired token at a glance (isTokenError).
// Not a "use server" module.
import {
  JiraError,
  type JiraApi,
  type JiraApiFactory,
  type JiraComment,
  type JiraHistory,
  type JiraIssue,
  type JiraIssueType,
  type JiraPermissions,
  type JiraProjectInfo,
  type JiraTransition,
  type JiraUserRef,
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

/** A Data Center user ({ key, name, displayName }) as the contract's reference: the key is the id. */
function userRef(raw: unknown): JiraUserRef | undefined {
  const u = record(raw);
  const id = typeof u.key === "string" && u.key ? u.key : typeof u.name === "string" && u.name ? u.name : null;
  if (id === null) return undefined;
  return { accountId: id, ...(typeof u.displayName === "string" ? { displayName: u.displayName } : {}) };
}

function issueOf(raw: unknown): JiraIssue {
  const i = raw as JiraIssue;
  const histories = record(record(raw).changelog).histories;
  if (!Array.isArray(histories)) return i;
  return {
    ...i,
    changelog: { histories: histories.map((h): JiraHistory => ({ ...(h as JiraHistory), author: userRef(record(h).author) })) },
  };
}

function commentOf(raw: unknown): JiraComment {
  return { ...(raw as JiraComment), author: userRef(record(raw).author) };
}

export function createDcApi(
  s: { siteUrl: string; projectKey: string },
  token: string,
  opts: Opts = {},
): JiraApi {
  const doFetch = opts.fetch ?? fetch;
  const sleep = opts.sleep ?? wait;
  const auth = "Bearer " + token;
  const base = `${s.siteUrl}/rest/api/2`;

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

  return {
    async myself() {
      const r = record(await call("GET", "/myself"));
      const id = typeof r.key === "string" && r.key ? r.key : typeof r.name === "string" && r.name ? r.name : null;
      if (id === null) throw new JiraError("502 Jira did not say who the token belongs to", 502);
      return { id, name: typeof r.displayName === "string" ? r.displayName : id };
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
        const types = pick(r.values ?? r.issueTypes);
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
      let startAt = 0;
      for (let page = 0; page < MAX_PAGES; page++) {
        const q = `jql=${enc(jql)}&fields=${FIELDS.join(",")}&startAt=${startAt}&maxResults=${PAGE}${o?.changelog ? "&expand=changelog" : ""}`;
        const r = record(await call("GET", `/search?${q}`));
        const list = Array.isArray(r.issues) ? r.issues : [];
        for (const i of list) out.push(issueOf(i));
        startAt += list.length;
        if (list.length === 0 || typeof r.total !== "number" || startAt >= r.total) break;
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
        out.push(...list.map(commentOf));
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
      await call("POST", `/issue/${enc(key)}/comment`, { body: text });
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

export const dcApi: JiraApiFactory = (settings, token) => createDcApi(settings, token);
