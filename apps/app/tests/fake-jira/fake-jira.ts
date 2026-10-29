// A small fake of Jira Cloud (REST API v3) for the sync's tests and for local work
// (`node tests/fake-jira/server.mjs --port 4010`). node:http only, no dependencies, and no imports from
// src/ - server.mjs runs this file directly with Node's type stripping, so it sticks to syntax that
// erases cleanly (no enums, no parameter properties).
//
// What it models, just enough for the sync:
//  - a workflow graph: statuses with a category, and the transitions open from each (To Do cannot go
//    straight to Done unless `directDone` is set, like many real workflows);
//  - issues with labels, a parent, comments (ADF) and a CHANGELOG whose histories name an accountId;
//  - a JQL subset: `project = K`, `labels = "x"`, `updated >= "-Nm"`, `key in (..)`, `key = K`,
//    `parent in (..)`, joined by AND, with an optional ORDER BY that is ignored;
//  - 429 injection (`fake.inject429(n, retryAfterSeconds)`);
//  - a request log (`fake.requests`), so a test can say "this round wrote nothing to Jira".
// People act through `fake.human.*` (or the /__fake/* endpoints, for a browser test): the integration
// account's own writes go through the REST API like the real client's.
import { createServer } from "node:http";
import type { IncomingMessage, Server, ServerResponse } from "node:http";

type Category = "new" | "indeterminate" | "done";
type Status = { id: string; name: string; statusCategory: { key: Category } };
type History = {
  id: string; created: string; author?: { accountId: string; displayName: string };
  items: { field: string; from: string | null; to: string | null; fromString: string | null; toString: string | null }[];
};
type Comment = { id: string; author: { accountId: string; displayName: string }; body: unknown; created: string; updated: string };
type FakeIssue = {
  id: string; key: string; summary: string; status: Status; typeId: string; parentKey: string | null; labels: string[];
  created: number; updated: number; histories: History[]; comments: Comment[];
};

export type FakeOptions = {
  /** API token the fake accepts (the password half of Basic auth). */
  token?: string;
  /** The integration account: the email it signs in with, and the accountId /myself answers. */
  email?: string;
  accountId?: string;
  projectKey?: string;
  /** To Do -> Done in one step. Off by default: the sync must hop through In Progress. */
  directDone?: boolean;
  /** Nothing leaves Done (no reopen), so a card moved back from Done has no way to follow. */
  stuckDone?: boolean;
  /** What /mypermissions says. Everything is allowed by default. */
  permissions?: Partial<Record<"BROWSE_PROJECTS" | "CREATE_ISSUES" | "EDIT_ISSUES" | "TRANSITION_ISSUES" | "ADD_COMMENTS", boolean>>;
  now?: () => number;
  /** Port to listen on; 0 (default) picks a free one. */
  port?: number;
};

export type Req = { method: string; path: string; body: unknown };

export const EPIC_TYPE = { id: "10000", name: "Epic" };
export const TASK_TYPE = { id: "10001", name: "Task" };

const TODO: Status = { id: "1", name: "To Do", statusCategory: { key: "new" } };
const DOING: Status = { id: "3", name: "In Progress", statusCategory: { key: "indeterminate" } };
const DONE: Status = { id: "10", name: "Done", statusCategory: { key: "done" } };

const stamp = (ms: number): string => new Date(ms).toISOString().replace("Z", "+0000");

const adfOf = (text: string) => ({
  version: 1, type: "doc",
  content: text.split("\n").filter(Boolean).map((line) => ({ type: "paragraph", content: [{ type: "text", text: line }] })),
});

export type FakeJira = Awaited<ReturnType<typeof startFakeJira>>;

export async function startFakeJira(opts: FakeOptions = {}) {
  const token = opts.token ?? "fake-token";
  const email = opts.email ?? "jira-bot@example.com";
  const bot = { accountId: opts.accountId ?? "acc-bot", displayName: "NextUp Bot" };
  const projectKey = opts.projectKey ?? "NUP";
  const now = opts.now ?? Date.now;
  const perms = { BROWSE_PROJECTS: true, CREATE_ISSUES: true, EDIT_ISSUES: true, TRANSITION_ISSUES: true, ADD_COMMENTS: true, ...opts.permissions };

  const statuses = [TODO, DOING, DONE];
  // From each status: where the workflow lets an issue go. Transition ids are "t<to id>".
  const graph: Record<string, Status[]> = {
    [TODO.id]: opts.directDone ? [DOING, DONE] : [DOING],
    [DOING.id]: [TODO, DONE],
    [DONE.id]: opts.stuckDone ? [] : [DOING],
  };

  const issues = new Map<string, FakeIssue>();
  const requests: Req[] = [];
  let nextIssue = 1;
  let nextHistory = 10000;
  let nextComment = 20000;
  let fail429 = 0;
  let retryAfter = 1;

  const touch = (i: FakeIssue) => { i.updated = now(); };
  const record = (i: FakeIssue, who: { accountId: string; displayName: string } | undefined, field: string, from: string | null, to: string | null, fromString: string | null = from, toString: string | null = to) => {
    i.histories.push({ id: String(nextHistory++), created: stamp(now()), author: who, items: [{ field, from, to, fromString, toString }] });
    touch(i);
  };
  const person = (accountId: string) => ({ accountId, displayName: accountId });

  const create = (p: { typeId: string; summary: string; parentKey: string | null; labels: string[] }): FakeIssue => {
    const n = nextIssue++;
    const i: FakeIssue = {
      id: String(10000 + n), key: `${projectKey}-${n}`, summary: p.summary, status: TODO, typeId: p.typeId, parentKey: p.parentKey,
      labels: [...p.labels], created: now(), updated: now(), histories: [], comments: [],
    };
    issues.set(i.key, i);
    return i;
  };

  // ---- JQL subset ----
  type Clause = (i: FakeIssue) => boolean;
  const parseJql = (jql: string): Clause[] => {
    const body = jql.replace(/\s+ORDER\s+BY\s+.*$/i, "").trim();
    if (!body) return [];
    return body.split(/\s+AND\s+/i).map((raw): Clause => {
      const c = raw.trim();
      let m: RegExpExecArray | null;
      if ((m = /^project\s*=\s*"?([A-Za-z0-9_]+)"?$/i.exec(c))) return (i) => i.key.startsWith(m![1].toUpperCase() + "-");
      if ((m = /^labels\s*=\s*"([^"]*)"$/i.exec(c))) return (i) => i.labels.includes(m![1]);
      if ((m = /^updated\s*>=\s*"-(\d+)m"$/i.exec(c))) return (i) => i.updated >= now() - Number(m![1]) * 60_000;
      if ((m = /^key\s*=\s*"?([A-Za-z0-9_-]+)"?$/i.exec(c))) return (i) => i.key === m![1];
      if ((m = /^key\s+in\s*\(([^)]*)\)$/i.exec(c))) { const set = new Set(m[1].split(",").map((s) => s.trim())); return (i) => set.has(i.key); }
      if ((m = /^parent\s+in\s*\(([^)]*)\)$/i.exec(c))) { const set = new Set(m[1].split(",").map((s) => s.trim())); return (i) => i.parentKey !== null && set.has(i.parentKey); }
      throw new Error(`Error in the JQL Query: unsupported clause "${c}"`);
    });
  };

  const typeName = (id: string) => (id === EPIC_TYPE.id ? EPIC_TYPE.name : TASK_TYPE.name);
  const view = (i: FakeIssue, changelog: boolean) => ({
    id: i.id, key: i.key,
    fields: {
      summary: i.summary, status: i.status, issuetype: { id: i.typeId, name: typeName(i.typeId), subtask: false },
      ...(i.parentKey ? { parent: { key: i.parentKey } } : {}), labels: i.labels, updated: stamp(i.updated),
    },
    ...(changelog ? { changelog: { histories: i.histories } } : {}),
  });

  // ---- HTTP ----
  const json = (res: ServerResponse, status: number, body: unknown, headers: Record<string, string> = {}) => {
    res.writeHead(status, { "content-type": "application/json", ...headers });
    res.end(body === undefined ? "" : JSON.stringify(body));
  };
  const fail = (res: ServerResponse, status: number, message: string) => json(res, status, { errorMessages: [message], errors: {} });
  const readBody = (req: IncomingMessage): Promise<string> =>
    new Promise((resolve) => { let s = ""; req.on("data", (c) => (s += c)); req.on("end", () => resolve(s)); });

  const handle = async (req: IncomingMessage, res: ServerResponse) => {
    const url = new URL(req.url ?? "/", "http://fake");
    const raw = await readBody(req);
    let body: unknown = undefined;
    try { body = raw ? JSON.parse(raw) : undefined; } catch { body = raw; }
    const method = req.method ?? "GET";

    if (url.pathname.startsWith("/__fake/")) return control(method, url, body, res);

    requests.push({ method, path: url.pathname + url.search, body });
    if (fail429 > 0) {
      fail429--;
      return json(res, 429, { errorMessages: ["Rate limit exceeded"] }, { "retry-after": String(retryAfter) });
    }
    const expected = "Basic " + Buffer.from(`${email}:${token}`).toString("base64");
    if (req.headers.authorization !== expected) return json(res, 401, { message: "Unauthorized" });

    const p = url.pathname.replace(/^\/rest\/api\/3/, "");
    let m: RegExpExecArray | null;
    try {
      if (method === "GET" && p === "/myself") return json(res, 200, bot);
      if (method === "GET" && (m = /^\/project\/([^/]+)$/.exec(p))) {
        if (m[1] !== projectKey) return fail(res, 404, "No project could be found with key '" + m[1] + "'.");
        return json(res, 200, { id: "10100", key: projectKey, name: "NextUp test", issueTypes: [EPIC_TYPE, TASK_TYPE] });
      }
      if (method === "GET" && (m = /^\/issue\/createmeta\/([^/]+)\/issuetypes$/.exec(p))) {
        return json(res, 200, { issueTypes: [{ ...EPIC_TYPE, subtask: false }, { ...TASK_TYPE, subtask: false }] });
      }
      if (method === "GET" && p === "/mypermissions") {
        const out: Record<string, { havePermission: boolean }> = {};
        for (const n of (url.searchParams.get("permissions") ?? "").split(",").filter(Boolean)) out[n] = { havePermission: perms[n as keyof typeof perms] === true };
        return json(res, 200, { permissions: out });
      }
      if (method === "POST" && p === "/search/jql") {
        const b = body as { jql?: string; maxResults?: number; nextPageToken?: string; expand?: string };
        const clauses = parseJql(b.jql ?? "");
        const all = [...issues.values()].filter((i) => clauses.every((c) => c(i)));
        const start = Number(b.nextPageToken ?? 0);
        const size = Math.min(b.maxResults ?? 50, 100);
        const page = all.slice(start, start + size);
        const more = start + size < all.length;
        return json(res, 200, { issues: page.map((i) => view(i, (b.expand ?? "").includes("changelog"))), ...(more ? { nextPageToken: String(start + size) } : {}), isLast: !more });
      }
      if (method === "POST" && p === "/issue") {
        if (!perms.CREATE_ISSUES) return fail(res, 403, "You do not have permission to create issues.");
        const f = (body as { fields: { summary: string; issuetype: { id: string }; parent?: { key: string }; labels?: string[] } }).fields;
        const i = create({ typeId: f.issuetype.id, summary: f.summary, parentKey: f.parent?.key ?? null, labels: f.labels ?? [] });
        return json(res, 201, { id: i.id, key: i.key });
      }
      if ((m = /^\/issue\/([^/]+)(?:\/(comment|transitions))?$/.exec(p))) {
        const i = issues.get(m[1]);
        if (!i) return fail(res, 404, "Issue does not exist or you do not have permission to see it.");
        const sub = m[2];
        if (!sub && method === "GET") return json(res, 200, view(i, url.searchParams.get("expand")?.includes("changelog") === true));
        if (!sub && method === "PUT") {
          if (!perms.EDIT_ISSUES) return fail(res, 403, "You do not have permission to edit issues.");
          const b = body as { fields?: { summary?: string }; update?: { labels?: { add?: string }[] } };
          if (typeof b.fields?.summary === "string" && b.fields.summary !== i.summary) {
            record(i, bot, "summary", null, null, i.summary, b.fields.summary);
            i.summary = b.fields.summary;
          }
          for (const l of b.update?.labels ?? []) if (l.add && !i.labels.includes(l.add)) { i.labels.push(l.add); record(i, bot, "labels", null, l.add); }
          return json(res, 204, undefined);
        }
        if (sub === "comment" && method === "GET") {
          const from = Number(url.searchParams.get("startAt") ?? 0);
          const size = Number(url.searchParams.get("maxResults") ?? 50);
          return json(res, 200, { comments: i.comments.slice(from, from + size), total: i.comments.length, startAt: from, maxResults: size });
        }
        if (sub === "comment" && method === "POST") {
          if (!perms.ADD_COMMENTS) return fail(res, 403, "You do not have permission to comment.");
          const c: Comment = { id: String(nextComment++), author: bot, body: (body as { body: unknown }).body, created: stamp(now()), updated: stamp(now()) };
          i.comments.push(c);
          touch(i);
          return json(res, 201, c);
        }
        if (sub === "transitions" && method === "GET") {
          return json(res, 200, { transitions: (graph[i.status.id] ?? []).map((to) => ({ id: "t" + to.id, name: "Move to " + to.name, to })) });
        }
        if (sub === "transitions" && method === "POST") {
          if (!perms.TRANSITION_ISSUES) return fail(res, 403, "You do not have permission to move issues.");
          const id = (body as { transition: { id: string } }).transition.id;
          const to = (graph[i.status.id] ?? []).find((s) => "t" + s.id === id);
          if (!to) return fail(res, 400, "Transition " + id + " is not valid for this issue.");
          record(i, bot, "status", i.status.id, to.id, i.status.name, to.name);
          i.status = to;
          return json(res, 204, undefined);
        }
      }
      return fail(res, 404, `No such endpoint: ${method} ${p}`);
    } catch (e) {
      return fail(res, 400, e instanceof Error ? e.message : "Bad request");
    }
  };

  // ---- People ----
  const statusByName = (name: string): Status => {
    const s = statuses.find((x) => x.name.toLowerCase() === name.toLowerCase() || x.id === name);
    if (!s) throw new Error(`No status "${name}"`);
    return s;
  };
  const get = (key: string): FakeIssue => {
    const i = issues.get(key);
    if (!i) throw new Error(`No issue ${key}`);
    return i;
  };
  const human = {
    /** A person drags the issue to a status (the workflow graph is not enforced for people). */
    move(key: string, status: string, who = "alice") {
      const i = get(key);
      const to = statusByName(status);
      record(i, person(who), "status", i.status.id, to.id, i.status.name, to.name);
      i.status = to;
    },
    rename(key: string, summary: string, who = "alice") {
      const i = get(key);
      record(i, person(who), "summary", null, null, i.summary, summary);
      i.summary = summary;
    },
    comment(key: string, text: string, who = "alice"): string {
      const i = get(key);
      const c: Comment = { id: String(nextComment++), author: person(who), body: adfOf(text), created: stamp(now()), updated: stamp(now()) };
      i.comments.push(c);
      touch(i);
      return c.id;
    },
    /** A person adds an issue under an epic. */
    createChild(parentKey: string, summary: string, typeId = TASK_TYPE.id): string {
      return create({ typeId, summary, parentKey, labels: [] }).key;
    },
    /** An automation rule moves it: a history without an author. */
    automationMove(key: string, status: string) {
      const i = get(key);
      const to = statusByName(status);
      record(i, undefined, "status", i.status.id, to.id, i.status.name, to.name);
      i.status = to;
    },
  };

  // ---- /__fake/*: the same controls over HTTP, for a browser test or a person at the terminal ----
  const control = async (method: string, url: URL, body: unknown, res: ServerResponse) => {
    const b = (body ?? {}) as Record<string, string | number>;
    try {
      switch (url.pathname) {
        case "/__fake/state":
          return json(res, 200, { account: bot, issues: [...issues.values()].map((i) => ({ ...view(i, false), comments: i.comments.length })) });
        case "/__fake/move": human.move(String(b.key), String(b.status), String(b.who ?? "alice")); break;
        case "/__fake/rename": human.rename(String(b.key), String(b.summary), String(b.who ?? "alice")); break;
        case "/__fake/comment": return json(res, 200, { id: human.comment(String(b.key), String(b.text), String(b.who ?? "alice")) });
        case "/__fake/child": return json(res, 200, { key: human.createChild(String(b.parent), String(b.summary)) });
        case "/__fake/429": fail429 = Number(b.count ?? 1); retryAfter = Number(b.retryAfter ?? 1); break;
        default: return fail(res, 404, "No such control");
      }
      return json(res, 200, { ok: true });
    } catch (e) {
      return fail(res, 400, e instanceof Error ? e.message : "Bad request");
    }
  };

  const server: Server = createServer((req, res) => void handle(req, res));
  await new Promise<void>((resolve) => server.listen(opts.port ?? 0, "127.0.0.1", resolve));
  const address = server.address();
  const url = `http://127.0.0.1:${typeof address === "object" && address ? address.port : opts.port}`;
  return {
    server, url, email, token, projectKey, accountId: bot.accountId, issues, requests, human, get,
    /** The next `n` calls answer 429 with Retry-After. */
    inject429(n: number, retryAfterSeconds = 1) { fail429 = n; retryAfter = retryAfterSeconds; },
    /** Requests that changed something in Jira (everything but reads and searches). */
    writes(): Req[] { return requests.filter((r) => r.method !== "GET" && !r.path.endsWith("/search/jql")); },
    close: () => new Promise<void>((r) => { server.closeAllConnections(); server.close(() => r()); }),
  };
}
