// A small fake of Jira Cloud (REST API v3), or with `flavor: "dc"` of Jira Data Center (REST API v2: Bearer
// token, plain-text comments, users by key, GET /search paged by startAt) for the sync's tests and for local work
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
//  - a revoked token (`fake.setToken(other)`): from then on the old token gets 401, as Jira answers an
//    expired or revoked API token;
//  - a request log (`fake.requests`), so a test can say "this round wrote nothing to Jira";
//  - versions of the project (JSY): GET /project/{key}/versions (array, archived included), on Cloud also the paged
//    GET /project/{key}/version, GET/POST/PUT/DELETE /version, with Jira's rules: a name is unique in the project and at most
//    255 characters, dates are YYYY-MM-DD (null clears one), writes need Administer Projects (`permissions.ADMINISTER_PROJECTS`),
//    deleting a version takes it off the issues. Renaming or releasing a version does not touch its issues' `updated`;
//  - fix versions and attachments on issues (fields.fixVersions, fields.attachment; PUT fields.fixVersions or update.fixVersions
//    set them and write a "Fix Version" history), and `fixVersion = <id or name>` in the JQL subset;
//  - failures at the API boundary: `injectStatus` (5xx for the next n calls), `dropConnection` (the next n connections die before
//    anything happens) and `loseResponse` (the request is processed and the answer never arrives, like a create whose response was lost).
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
type FakeVersion = { id: string; name: string; description?: string; startDate?: string; releaseDate?: string; released: boolean; archived: boolean; projectKey: string };
type FakeAttachment = { id: string; filename: string; size: number; mimeType: string; created: string; authorAccountId: string };
type FakeIssue = {
  id: string; key: string; summary: string; status: Status; typeId: string; parentKey: string | null; labels: string[];
  created: number; updated: number; histories: History[]; comments: Comment[];
  /** Version ids. */
  fixVersions: string[]; attachments: FakeAttachment[];
};

export type FakeOptions = {
  /** "cloud" (default) or "dc" (Data Center dialect). */
  flavor?: "cloud" | "dc";
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
  permissions?: Partial<Record<"BROWSE_PROJECTS" | "CREATE_ISSUES" | "EDIT_ISSUES" | "TRANSITION_ISSUES" | "ADD_COMMENTS" | "ADMINISTER_PROJECTS", boolean>>;
  now?: () => number;
  /**
   * Added to the comment and history ids, so a second fake in one test file (one company) does not repeat the
   * first one's ids: the sync's idempotency keys carry them. Below 5000.
   */
  idBase?: number;
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
  const dc = opts.flavor === "dc";
  let token = opts.token ?? "fake-token";
  const email = opts.email ?? "jira-bot@example.com";
  const bot = { accountId: opts.accountId ?? "acc-bot", displayName: "NextUp Bot" };
  const projectKey = opts.projectKey ?? "NUP";
  const now = opts.now ?? Date.now;
  const perms = { BROWSE_PROJECTS: true, CREATE_ISSUES: true, EDIT_ISSUES: true, TRANSITION_ISSUES: true, ADD_COMMENTS: true, ADMINISTER_PROJECTS: true, ...opts.permissions };

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
  let nextHistory = 10000 + (opts.idBase ?? 0);
  let nextComment = 20000 + (opts.idBase ?? 0);
  let fail429 = 0;
  let retryAfter = 1;
  const versions = new Map<string, FakeVersion>();
  let nextVersion = 20001;
  let nextAttachment = 30001;
  let siteUrl = "";
  let failStatus = 0;
  let failStatusCode = 500;
  let dropNext = 0;
  const lose: { method: string; path: RegExp; left: number }[] = [];

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
      labels: [...p.labels], created: now(), updated: now(), histories: [], comments: [], fixVersions: [], attachments: [],
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
      if ((m = /^fixVersion\s*=\s*"?([^"]+)"?$/i.exec(c))) return (i) => i.fixVersions.some((id) => id === m![1] || versions.get(id)?.name === m![1]);
      if ((m = /^parent\s+in\s*\(([^)]*)\)$/i.exec(c))) { const set = new Set(m[1].split(",").map((s) => s.trim())); return (i) => i.parentKey !== null && set.has(i.parentKey); }
      throw new Error(`Error in the JQL Query: unsupported clause "${c}"`);
    });
  };

  /** A user as the dialect writes it: accountId on Cloud, key and name on Data Center. */
  const userOut = <T extends { accountId: string; displayName: string } | undefined>(u: T) =>
    !u || !dc ? u : { key: u.accountId, name: u.accountId, displayName: u.displayName };
  const apiBase = () => `${siteUrl}/rest/api/${dc ? 2 : 3}`;
  const versionOut = (v: FakeVersion) => ({
    self: `${apiBase()}/version/${v.id}`, id: v.id, name: v.name, ...(v.description !== undefined ? { description: v.description } : {}),
    archived: v.archived, released: v.released, ...(v.startDate ? { startDate: v.startDate } : {}), ...(v.releaseDate ? { releaseDate: v.releaseDate } : {}),
    overdue: !v.released && v.releaseDate !== undefined && Date.parse(v.releaseDate) < now(), projectId: 10100,
  });
  /** What an issue's fix versions field shows of a version. */
  const fixVersionOut = (v: FakeVersion) => ({
    self: `${apiBase()}/version/${v.id}`, id: v.id, name: v.name, archived: v.archived, released: v.released, ...(v.releaseDate ? { releaseDate: v.releaseDate } : {}),
  });
  const attachmentOut = (a: FakeAttachment) => ({
    self: `${apiBase()}/attachment/${a.id}`, id: a.id, filename: a.filename, size: a.size, mimeType: a.mimeType, created: a.created,
    author: userOut(person(a.authorAccountId)), content: `${siteUrl}/secure/attachment/${a.id}/${encodeURIComponent(a.filename)}`,
  });
  const commentOut = (c: Comment) => ({ ...c, author: userOut(c.author) });
  const typeName = (id: string) => (id === EPIC_TYPE.id ? EPIC_TYPE.name : TASK_TYPE.name);
  const view = (i: FakeIssue, changelog: boolean) => ({
    id: i.id, key: i.key,
    fields: {
      summary: i.summary, status: i.status, issuetype: { id: i.typeId, name: typeName(i.typeId), subtask: false },
      ...(i.parentKey ? { parent: { key: i.parentKey } } : {}), labels: i.labels, updated: stamp(i.updated),
      fixVersions: i.fixVersions.flatMap((id) => { const v = versions.get(id); return v ? [fixVersionOut(v)] : []; }),
      attachment: i.attachments.map(attachmentOut),
    },
    ...(changelog ? { changelog: { histories: i.histories.map((h) => ({ ...h, author: userOut(h.author) })) } } : {}),
  });

  // ---- versions ----
  const DATE = /^\d{4}-\d{2}-\d{2}$/;
  const validDate = (v: unknown): v is string => typeof v === "string" && DATE.test(v) && !Number.isNaN(Date.parse(v)) && new Date(Date.parse(v)).toISOString().slice(0, 10) === v;
  /** What Jira says about a version's fields, as the errors object of a 400; null when they are fine. */
  const versionProblem = (f: { name?: unknown; description?: unknown; startDate?: unknown; releaseDate?: unknown; released?: unknown; archived?: unknown }, own: FakeVersion | null): Record<string, string> | null => {
    const errors: Record<string, string> = {};
    if (f.name !== undefined) {
      if (typeof f.name !== "string" || f.name.trim() === "") errors.name = "You must specify a valid version name";
      else if (f.name.length > 255) errors.name = "The name must be shorter than 255 characters.";
      else if ([...versions.values()].some((v) => v.projectKey === (own?.projectKey ?? projectKey) && v.id !== own?.id && v.name.toLowerCase() === (f.name as string).trim().toLowerCase())) errors.name = "A version with this name already exists in this project.";
    }
    if (f.description !== undefined && f.description !== null && (typeof f.description !== "string" || f.description.length > 32767)) errors.description = "The description is too long.";
    for (const k of ["startDate", "releaseDate"] as const) if (f[k] !== undefined && f[k] !== null && !validDate(f[k])) errors[k] = "Could not parse the date. Use the format yyyy-mm-dd.";
    for (const k of ["released", "archived"] as const) if (f[k] !== undefined && typeof f[k] !== "boolean") errors[k] = "Boolean expected.";
    return Object.keys(errors).length ? errors : null;
  };
  const setFixVersionIds = (i: FakeIssue, ids: string[], who: { accountId: string; displayName: string } | undefined) => {
    const before = i.fixVersions;
    if (before.length === ids.length && before.every((id, k) => id === ids[k])) return;
    const names = (list: string[]) => list.map((id) => versions.get(id)?.name ?? id).join(",") || null;
    record(i, who, "Fix Version", before.join(",") || null, ids.join(",") || null, names(before), names(ids));
    i.fixVersions = [...ids];
  };
  const removeVersion = (id: string, who: { accountId: string; displayName: string } | undefined) => {
    for (const i of issues.values()) if (i.fixVersions.includes(id)) setFixVersionIds(i, i.fixVersions.filter((x) => x !== id), who);
    versions.delete(id);
  };
  const createVersion = (f: { name: string; description?: string; startDate?: string; releaseDate?: string; released?: boolean; archived?: boolean }, key = projectKey): FakeVersion => {
    const v: FakeVersion = { id: String(nextVersion++), name: f.name.trim(), released: f.released === true, archived: f.archived === true, projectKey: key };
    if (f.description !== undefined) v.description = f.description;
    if (f.startDate) v.startDate = f.startDate;
    if (f.releaseDate) v.releaseDate = f.releaseDate;
    versions.set(v.id, v);
    return v;
  };

  // ---- HTTP ----
  const json = (res: ServerResponse, status: number, body: unknown, headers: Record<string, string> = {}) => {
    res.writeHead(status, { "content-type": "application/json", ...headers });
    res.end(body === undefined ? "" : JSON.stringify(body));
  };
  const fail = (res: ServerResponse, status: number, message: string) => json(res, status, { errorMessages: [message], errors: {} });
  const failFields = (res: ServerResponse, status: number, errors: Record<string, string>) => json(res, status, { errorMessages: [], errors });
  const readBody = (req: IncomingMessage): Promise<string> =>
    new Promise((resolve) => { let s = ""; req.on("data", (c) => (s += c)); req.on("end", () => resolve(s)); });

  const handle = async (req: IncomingMessage, res: ServerResponse) => {
    const url = new URL(req.url ?? "/", "http://fake");
    const raw = await readBody(req);
    let body: unknown = undefined;
    try { body = raw ? JSON.parse(raw) : undefined; } catch { body = raw; }
    const method = req.method ?? "GET";

    if (url.pathname.startsWith("/__fake/")) return control(method, url, body, res);

    if (dropNext > 0) { dropNext--; req.socket.destroy(); return; }
    requests.push({ method, path: url.pathname + url.search, body });
    // A lost response: the request is processed below, and the answer never arrives.
    const lost = lose.find((l) => l.left > 0 && l.method === method && l.path.test(url.pathname));
    if (lost) {
      lost.left--;
      res.writeHead = () => res;
      res.end = () => { req.socket.destroy(); return res; };
    }
    if (failStatus > 0) { failStatus--; return json(res, failStatusCode, { errorMessages: ["Service unavailable"] }); }
    if (fail429 > 0) {
      fail429--;
      return json(res, 429, { errorMessages: ["Rate limit exceeded"] }, { "retry-after": String(retryAfter) });
    }
    const expected = dc ? "Bearer " + token : "Basic " + Buffer.from(`${email}:${token}`).toString("base64");
    if (req.headers.authorization !== expected) return json(res, 401, { message: "Unauthorized" });

    const p = (dc ? url.pathname.replace(new RegExp('^/rest/api/2'), '') : url.pathname).replace(/^\/rest\/api\/3/, "");
    let m: RegExpExecArray | null;
    try {
      if (method === "GET" && p === "/myself") return json(res, 200, dc ? userOut(bot) : bot);
      if (method === "GET" && (m = /^\/project\/([^/]+)$/.exec(p))) {
        if (m[1] !== projectKey) return fail(res, 404, "No project could be found with key '" + m[1] + "'.");
        return json(res, 200, { id: "10100", key: projectKey, name: "NextUp test", issueTypes: [EPIC_TYPE, TASK_TYPE] });
      }
      if (method === "GET" && (m = /^\/issue\/createmeta\/([^/]+)\/issuetypes$/.exec(p))) {
        const list = [{ ...EPIC_TYPE, subtask: false }, { ...TASK_TYPE, subtask: false }];
        return json(res, 200, dc ? { values: list } : { issueTypes: list });
      }
      if (method === "GET" && p === "/mypermissions") {
        const out: Record<string, { havePermission: boolean }> = {};
        for (const n of (url.searchParams.get("permissions") ?? "").split(",").filter(Boolean)) out[n] = { havePermission: perms[n as keyof typeof perms] === true };
        return json(res, 200, { permissions: out });
      }
      if ((m = /^\/project\/([^/]+)\/versions$/.exec(p)) && method === "GET") {
        if (m[1] !== projectKey) return fail(res, 404, "No project could be found with key '" + m[1] + "'.");
        return json(res, 200, [...versions.values()].filter((v) => v.projectKey === projectKey).map(versionOut));
      }
      // Jira Cloud pages the project's versions; Data Center has only the array above.
      if (!dc && method === "GET" && (m = /^\/project\/([^/]+)\/version$/.exec(p))) {
        if (m[1] !== projectKey) return fail(res, 404, "No project could be found with key '" + m[1] + "'.");
        const all = [...versions.values()].filter((v) => v.projectKey === projectKey);
        const start = Number(url.searchParams.get("startAt") ?? 0);
        const size = Math.min(Number(url.searchParams.get("maxResults") ?? 50), 50);
        return json(res, 200, { self: url.href, maxResults: size, startAt: start, total: all.length, isLast: start + size >= all.length, values: all.slice(start, start + size).map(versionOut) });
      }
      if (method === "POST" && p === "/version") {
        const b = (body ?? {}) as Record<string, unknown>;
        if (!perms.ADMINISTER_PROJECTS) return fail(res, 403, "You do not have permission to create versions in this project.");
        const key = typeof b.project === "string" ? b.project : projectKey;
        if (key !== projectKey) return failFields(res, 400, { project: "Project '" + key + "' does not exist." });
        if (b.name === undefined) return failFields(res, 400, { name: "You must specify a valid version name" });
        const problem = versionProblem(b, null);
        if (problem) return failFields(res, 400, problem);
        return json(res, 201, versionOut(createVersion({ name: b.name as string, description: b.description as string | undefined, startDate: b.startDate as string | undefined, releaseDate: b.releaseDate as string | undefined, released: b.released as boolean | undefined, archived: b.archived as boolean | undefined }, key)));
      }
      if ((m = /^\/version\/([^/]+)$/.exec(p))) {
        const v = versions.get(m[1]);
        if (!v) return fail(res, 404, "The version with id '" + m[1] + "' does not exist.");
        if (method === "GET") return json(res, 200, versionOut(v));
        if (method === "PUT") {
          if (!perms.ADMINISTER_PROJECTS) return fail(res, 403, "You do not have permission to edit versions in this project.");
          const b = (body ?? {}) as Record<string, unknown>;
          const problem = versionProblem(b, v);
          if (problem) return failFields(res, 400, problem);
          if (typeof b.name === "string") v.name = b.name.trim();
          if (b.description !== undefined) { if (b.description === null) delete v.description; else v.description = b.description as string; }
          for (const k of ["startDate", "releaseDate"] as const) if (b[k] !== undefined) { if (b[k] === null) delete v[k]; else v[k] = b[k] as string; }
          if (typeof b.released === "boolean") v.released = b.released;
          if (typeof b.archived === "boolean") v.archived = b.archived;
          return json(res, 200, versionOut(v));
        }
        if (method === "DELETE") {
          if (!perms.ADMINISTER_PROJECTS) return fail(res, 403, "You do not have permission to delete versions in this project.");
          removeVersion(v.id, bot);
          return json(res, 204, undefined);
        }
      }
      if (dc && method === "GET" && p === "/search") {
        const clauses = parseJql(url.searchParams.get("jql") ?? "");
        const all = [...issues.values()].filter((i) => clauses.every((c) => c(i)));
        const start = Number(url.searchParams.get("startAt") ?? 0);
        const size = Math.min(Number(url.searchParams.get("maxResults") ?? 50), 100);
        const cl = (url.searchParams.get("expand") ?? "").includes("changelog");
        return json(res, 200, { startAt: start, maxResults: size, total: all.length, issues: all.slice(start, start + size).map((i) => view(i, cl)) });
      }
      if (!dc && method === "POST" && p === "/search/jql") {
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
          const b = body as { fields?: { summary?: string; fixVersions?: { id?: string; name?: string }[] }; update?: { labels?: { add?: string }[]; fixVersions?: { add?: { id?: string; name?: string }; remove?: { id?: string; name?: string } }[] } };
          const resolve = (ref: { id?: string; name?: string } | undefined): string | null => {
            const v = ref?.id !== undefined ? versions.get(ref.id) : [...versions.values()].find((x) => x.name === ref?.name && x.projectKey === projectKey);
            return v ? v.id : null;
          };
          let next: string[] | null = null;
          if (b.fields?.fixVersions !== undefined) {
            const ids: string[] = [];
            for (const ref of b.fields.fixVersions) {
              const id = resolve(ref);
              if (id === null) return failFields(res, 400, { fixVersions: "Version with " + (ref.id !== undefined ? "id '" + ref.id + "'" : "name '" + ref.name + "'") + " does not exist." });
              if (!ids.includes(id)) ids.push(id);
            }
            next = ids;
          }
          for (const op of b.update?.fixVersions ?? []) {
            next = next ?? [...i.fixVersions];
            const ref = op.add ?? op.remove;
            const id = resolve(ref);
            if (id === null) return failFields(res, 400, { fixVersions: "Version with id '" + (ref?.id ?? ref?.name) + "' does not exist." });
            if (op.add && !next.includes(id)) next.push(id);
            if (op.remove) next = next.filter((x) => x !== id);
          }
          if (next) setFixVersionIds(i, next, bot);
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
          return json(res, 200, { comments: i.comments.slice(from, from + size).map(commentOut), total: i.comments.length, startAt: from, maxResults: size });
        }
        if (sub === "comment" && method === "POST") {
          if (!perms.ADD_COMMENTS) return fail(res, 403, "You do not have permission to comment.");
          const c: Comment = { id: String(nextComment++), author: bot, body: dc ? String((body as { body: unknown }).body) : (body as { body: unknown }).body, created: stamp(now()), updated: stamp(now()) };
          i.comments.push(c);
          touch(i);
          return json(res, 201, commentOut(c));
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
  const getVersion = (id: string): FakeVersion => {
    const v = versions.get(id);
    if (!v) throw new Error(`No version ${id}`);
    return v;
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
      const c: Comment = { id: String(nextComment++), author: person(who), body: dc ? text : adfOf(text), created: stamp(now()), updated: stamp(now()) };
      i.comments.push(c);
      touch(i);
      return c.id;
    },
    /** A person adds an issue under an epic. */
    createChild(parentKey: string, summary: string, typeId = TASK_TYPE.id): string {
      return create({ typeId, summary, parentKey, labels: [] }).key;
    },
    /** A person creates a version in Jira's project settings. */
    createVersion(name: string, f: { description?: string; startDate?: string; releaseDate?: string; released?: boolean } = {}, who = "alice"): string {
      void who;
      return createVersion({ name, ...f }).id;
    },
    /** A person releases or unreleases a version. The issues that carry it are not updated. */
    releaseVersion(id: string, released: boolean, who = "alice") { void who; getVersion(id).released = released; },
    renameVersion(id: string, name: string, who = "alice") { void who; getVersion(id).name = name; },
    setVersionDates(id: string, d: { startDate?: string | null; releaseDate?: string | null }, who = "alice") {
      void who;
      const v = getVersion(id);
      for (const k of ["startDate", "releaseDate"] as const) if (d[k] !== undefined) { if (d[k] === null) delete v[k]; else v[k] = d[k] as string; }
    },
    archiveVersion(id: string, who = "alice") { void who; getVersion(id).archived = true; },
    /** A person deletes a version: it leaves the issues that had it (a history on each). */
    deleteVersion(id: string, who = "alice") { getVersion(id); removeVersion(id, person(who)); },
    setFixVersions(key: string, ids: string[], who = "alice") {
      for (const id of ids) getVersion(id);
      setFixVersionIds(get(key), ids, person(who));
    },
    /** A person attaches a file: a record only, its bytes do not exist. */
    attach(key: string, f: { filename: string; size: number; mimeType?: string }, who = "alice"): string {
      const i = get(key);
      const a: FakeAttachment = { id: String(nextAttachment++), filename: f.filename, size: f.size, mimeType: f.mimeType ?? "application/octet-stream", created: stamp(now()), authorAccountId: who };
      i.attachments.push(a);
      record(i, person(who), "Attachment", null, a.id, null, f.filename);
      return a.id;
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
    const b = (body ?? {}) as Record<string, string | number | boolean | string[] | null>;
    try {
      switch (url.pathname) {
        case "/__fake/state":
          return json(res, 200, { account: bot, versions: [...versions.values()].map(versionOut), issues: [...issues.values()].map((i) => ({ ...view(i, false), comments: i.comments.length })) });
        case "/__fake/move": human.move(String(b.key), String(b.status), String(b.who ?? "alice")); break;
        case "/__fake/rename": human.rename(String(b.key), String(b.summary), String(b.who ?? "alice")); break;
        case "/__fake/comment": return json(res, 200, { id: human.comment(String(b.key), String(b.text), String(b.who ?? "alice")) });
        case "/__fake/child": return json(res, 200, { key: human.createChild(String(b.parent), String(b.summary)) });
        case "/__fake/createVersion": return json(res, 200, { id: human.createVersion(String(b.name), { description: b.description as string | undefined, startDate: b.startDate as string | undefined, releaseDate: b.releaseDate as string | undefined, released: b.released === true }, String(b.who ?? "alice")) });
        case "/__fake/releaseVersion": human.releaseVersion(String(b.id), b.released !== false, String(b.who ?? "alice")); break;
        case "/__fake/renameVersion": human.renameVersion(String(b.id), String(b.name), String(b.who ?? "alice")); break;
        case "/__fake/versionDates": human.setVersionDates(String(b.id), { startDate: b.startDate as string | null | undefined, releaseDate: b.releaseDate as string | null | undefined }, String(b.who ?? "alice")); break;
        case "/__fake/archiveVersion": human.archiveVersion(String(b.id), String(b.who ?? "alice")); break;
        case "/__fake/deleteVersion": human.deleteVersion(String(b.id), String(b.who ?? "alice")); break;
        case "/__fake/fixVersions": human.setFixVersions(String(b.key), (b.ids as unknown as string[]) ?? [], String(b.who ?? "alice")); break;
        case "/__fake/attach": return json(res, 200, { id: human.attach(String(b.key), { filename: String(b.filename), size: Number(b.size ?? 0) }, String(b.who ?? "alice")) });
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
  siteUrl = url;
  return {
    server, url, email, token, projectKey, accountId: bot.accountId, issues, requests, human, get, versions,
    /** Change what /mypermissions says and what the writes accept, from now on (a permission lost between two rounds). */
    setPermissions(p: Partial<typeof perms>) { Object.assign(perms, p); },
    /** The next `n` calls answer with this 5xx status (the request is not processed). */
    injectStatus(n: number, status = 503) { failStatus = n; failStatusCode = status; },
    /** The next `n` connections are closed before anything happens: a network error, nothing was written. */
    dropConnection(n = 1) { dropNext = n; },
    /** The next `n` calls to `method` + a path matching `path` are processed, and their answer never arrives: a create whose response was lost. */
    loseResponse(method: string, path: RegExp, n = 1) { lose.push({ method, path, left: n }); },
    /** The next `n` calls answer 429 with Retry-After. */
    inject429(n: number, retryAfterSeconds = 1) { fail429 = n; retryAfter = retryAfterSeconds; },
    /** Accept only this token from now on: the one the sync holds is revoked and answers 401. */
    setToken(next: string) { token = next; },
    /** Requests that changed something in Jira (everything but reads and searches). */
    writes(): Req[] { return requests.filter((r) => r.method !== "GET" && !r.path.endsWith("/search/jql")); },
    close: () => new Promise<void>((r) => { server.closeAllConnections(); server.close(() => r()); }),
  };
}
