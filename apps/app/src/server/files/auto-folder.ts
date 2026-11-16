// The folder job: every idea a person raises gets its own SharePoint folder, and the project its yes opens links that same
// folder, so nobody links one by hand. The folders are made as NextUp's own app (client credentials, application permission
// Files.ReadWrite.All in NextUp's tenant), under one root: <root>/<company>/<idea title>. What needs a folder is decided in
// features/files/auto-folder.ts; this file talks to Graph and appends case.folder and project.linked as system:files.
//
// Runs after a raise or a decision (kickFolders) and every five minutes for what the kick missed (startFolderJob), over the
// rows of the last seven days. A no-op without a database, without the Entra app, or without SHAREPOINT_FOLDERS_ROOT and
// SHAREPOINT_FOLDERS_TENANT_ID. Never throws. Logs counts, timings and HTTP statuses only: never a name, a path or a token.
//
// NOT a "use server" module: nothing here checks who is asking.
import { reduce } from "@/features/cases/reducer";
import { seedFor } from "@/features/demo";
import { LIFE_SOURCE } from "@/features/demo/life/plan";
import { entraApp, isTenantId, tokenUrl } from "@/features/auth/entra";
import { folderOf } from "@/features/files/link";
import { FOLDER_ACTOR, folderName, folderTasks, type FolderTask } from "@/features/files/auto-folder";
import { getDb, hasDatabase } from "@/lib/db/client";
import { appendEventRow, loadLog } from "@/lib/db/events";

const GRAPH = "https://graph.microsoft.com/v1.0";
const TIMEOUT_MS = 15_000;
const EARLY_MS = 5 * 60_000;
const INTERVAL_MS = 5 * 60_000;
const KICK_DELAY_MS = 2_000;
const WINDOW_MS = 7 * 24 * 60 * 60_000;
/** At most this many folders per company and round: a burst waits for the next round instead of hammering Graph. */
const PER_ROUND = 25;
export const FOLDER_SOURCE = "files";
/** Rows no person wrote: the generated demo's life, the clock, the directory, the agent, and this job. */
const NOT_A_PERSON = ["clock", LIFE_SOURCE, "directory", "agent", FOLDER_SOURCE];

type Config = { tenantId: string; clientId: string; clientSecret: string; root: string };
type Company = { id: string; slug: string; name: string };
type Item = { id: string; driveId: string; webUrl: string };

/** The job's settings, or null when any is missing (then the job does nothing). */
export function folderConfig(env: Record<string, string | undefined> = process.env): Config | null {
  const app = entraApp(env);
  const tenantId = env.SHAREPOINT_FOLDERS_TENANT_ID?.trim();
  const root = env.SHAREPOINT_FOLDERS_ROOT?.trim();
  if (!app || !isTenantId(tenantId) || !root || !folderOf(root)) return null;
  return { tenantId, clientId: app.clientId, clientSecret: app.clientSecret, root };
}

let cachedToken: { token: string; until: number } | null = null;

async function appToken(c: Config): Promise<string | null> {
  if (cachedToken && cachedToken.until > Date.now()) return cachedToken.token;
  const res = await fetch(tokenUrl(c.tenantId), {
    method: "POST",
    headers: { "content-type": "application/x-www-form-urlencoded" },
    body: new URLSearchParams({ client_id: c.clientId, client_secret: c.clientSecret, grant_type: "client_credentials", scope: "https://graph.microsoft.com/.default" }),
    cache: "no-store",
    signal: AbortSignal.timeout(TIMEOUT_MS),
  });
  if (!res.ok) { console.warn(`[folders] token request answered ${res.status}`); return null; }
  const body = (await res.json()) as { access_token?: unknown; expires_in?: unknown };
  if (typeof body.access_token !== "string" || !body.access_token) return null;
  cachedToken = { token: body.access_token, until: Date.now() + (typeof body.expires_in === "number" ? body.expires_in : 0) * 1000 - EARLY_MS };
  return cachedToken.token;
}

const itemOf = (json: unknown): Item | null => {
  const j = json as { id?: unknown; webUrl?: unknown; parentReference?: { driveId?: unknown } } | null;
  return j && typeof j.id === "string" && typeof j.webUrl === "string" && typeof j.parentReference?.driveId === "string"
    ? { id: j.id, webUrl: j.webUrl, driveId: j.parentReference.driveId }
    : null;
};

/** One Graph call as the app: the item it answers, null for 404, "conflict" for 409; anything else throws (status only). */
async function graph(token: string, method: "GET" | "POST", url: string, body?: object): Promise<Item | null | "conflict"> {
  const res = await fetch(url, {
    method,
    headers: { authorization: `Bearer ${token}`, ...(body ? { "content-type": "application/json" } : {}) },
    body: body ? JSON.stringify(body) : undefined,
    cache: "no-store",
    signal: AbortSignal.timeout(TIMEOUT_MS),
  });
  if (res.status === 404) return null;
  if (res.status === 409) return "conflict";
  if (!res.ok) throw new Error(`Graph ${method} answered ${res.status}`);
  const item = itemOf(await res.json());
  if (!item) throw new Error(`Graph ${method} answered no item`);
  return item;
}

const SELECT = "$select=id,webUrl,parentReference";

/** The folder `name` directly inside `parent`, made when it is not there yet. */
async function folderIn(token: string, parent: Item, name: string): Promise<Item> {
  const at = `${GRAPH}/drives/${encodeURIComponent(parent.driveId)}/items/${encodeURIComponent(parent.id)}`;
  const found = await graph(token, "GET", `${at}:/${encodeURIComponent(name)}?${SELECT}`);
  if (found && found !== "conflict") return found;
  const made = await graph(token, "POST", `${at}/children?${SELECT}`, { name, folder: {}, "@microsoft.graph.conflictBehavior": "fail" });
  if (made && made !== "conflict") return made;
  // Someone made it between the look and the make.
  const again = await graph(token, "GET", `${at}:/${encodeURIComponent(name)}?${SELECT}`);
  if (again && again !== "conflict") return again;
  throw new Error("Graph folder could not be made");
}

/** A new folder inside `parent`; a name that is taken becomes "name 1" (conflictBehavior rename). */
async function newFolderIn(token: string, parent: Item, name: string): Promise<Item> {
  const at = `${GRAPH}/drives/${encodeURIComponent(parent.driveId)}/items/${encodeURIComponent(parent.id)}`;
  const made = await graph(token, "POST", `${at}/children?${SELECT}`, { name, folder: {}, "@microsoft.graph.conflictBehavior": "rename" });
  if (made && made !== "conflict") return made;
  throw new Error("Graph folder could not be made");
}

/** Ideas raised and projects opened by people in the window: the candidates. The state decides which still need a folder. */
async function candidates(companyId: string, since: Date): Promise<{ raised: string[]; decided: string[] }> {
  const rows = await getDb().caseEvent.findMany({
    where: { companyId, type: { in: ["case.raised", "case.decided"] }, ts: { gte: since }, source: { notIn: NOT_A_PERSON }, targetId: { not: null } },
    orderBy: { seq: "asc" },
    select: { type: true, targetId: true, actorUserId: true },
  });
  // A raise is a person's; a decision may be the approvals' settle (no user id), which still opens the project.
  const raised = rows.filter((r) => r.type === "case.raised" && r.actorUserId !== null).map((r) => r.targetId!);
  const decided = rows.filter((r) => r.type === "case.decided").map((r) => r.targetId!);
  return { raised, decided };
}

const running = new Map<string, Promise<number>>();

/** One company's round. Returns how many events it wrote. Never throws. */
export async function folderRound(company: Company, now = new Date()): Promise<number> {
  const inFlight = running.get(company.id);
  if (inFlight) return inFlight;
  const p = (async () => {
    const config = folderConfig();
    if (!config || !hasDatabase()) return 0;
    const started = Date.now();
    let written = 0;
    try {
      const { raised, decided } = await candidates(company.id, new Date(now.getTime() - WINDOW_MS));
      if (raised.length === 0 && decided.length === 0) return 0;
      const state = reduce(await seedFor(company.slug), await loadLog(company.id));
      const decidedSet = new Set(decided);
      const opened = state.cases.flatMap((c) => (decidedSet.has(c.id) && c.decided?.answer === "yes" && c.decided.projectId ? [c.decided.projectId] : []));
      const tasks = folderTasks(state, raised, opened).slice(0, PER_ROUND);
      if (tasks.length === 0) return 0;

      const token = await appToken(config);
      if (!token) return 0;
      const root = await graph(token, "GET", `${GRAPH}/shares/${encodeURIComponent(folderOf(config.root)!)}/driveItem?${SELECT}`);
      if (!root || root === "conflict") { console.warn("[folders] the root folder cannot be read"); return 0; }
      let home: Item | null = null;
      for (const task of tasks) {
        try {
          let url = task.kind === "project" ? task.url : null;
          if (!url) {
            home ??= await folderIn(token, root, folderName(company.name, company.slug));
            url = (await newFolderIn(token, home, folderName(task.title))).webUrl;
          }
          written += (await record(company.id, task, url)) ? 1 : 0;
        } catch (err) {
          console.warn(`[folders] ${task.kind} folder failed:`, err instanceof Error ? err.message : "error");
        }
      }
      console.info(`[folders] ${company.slug}: ${written} of ${tasks.length} in ${Date.now() - started}ms`);
    } catch (err) {
      console.warn(`[folders] ${company.slug} round failed after ${Date.now() - started}ms:`, err instanceof Error ? err.message : "error");
    }
    return written;
  })().finally(() => running.delete(company.id));
  running.set(company.id, p);
  return p;
}

/** case.folder for an idea, project.linked for a project, once each: the idempotency key names the target. */
async function record(companyId: string, task: FolderTask, url: string): Promise<boolean> {
  const target = task.kind === "idea" ? task.caseId : task.projectId;
  const idemKey = `folder:${target}`;
  const r = await appendEventRow(
    companyId,
    task.kind === "idea"
      ? { id: `e_folder_${companyId}_${target}`.slice(0, 64), day: 0, type: "case.folder", actor: FOLDER_ACTOR, targetId: target, payload: { system: "sharepoint", url } }
      : { id: `e_folder_${companyId}_${target}`.slice(0, 64), day: 0, type: "project.linked", actor: FOLDER_ACTOR, targetId: target, payload: { system: "sharepoint", url } },
    { actorUserId: null, source: FOLDER_SOURCE, idemKey },
  );
  if (!r.ok) throw new Error("append failed");
  return !r.duplicate;
}

/** Every company with a person's raise or decision in the window. */
async function companiesToVisit(now: Date): Promise<Company[]> {
  const rows = await getDb().caseEvent.findMany({
    where: { type: { in: ["case.raised", "case.decided"] }, ts: { gte: new Date(now.getTime() - WINDOW_MS) }, source: { notIn: NOT_A_PERSON } },
    distinct: ["companyId"],
    select: { companyId: true },
  });
  if (rows.length === 0) return [];
  return getDb().company.findMany({ where: { id: { in: rows.map((r) => r.companyId) } }, select: { id: true, slug: true, name: true } });
}

const pending = new Set<string>();
let kickTimer: ReturnType<typeof setTimeout> | null = null;

/** A round for this company soon, after a raise or a decision. Never throws. */
export function kickFolders(slug: string): void {
  try {
    if (!hasDatabase() || !folderConfig()) return;
    pending.add(slug);
    kickTimer ??= setTimeout(() => {
      kickTimer = null;
      const slugs = [...pending];
      pending.clear();
      void (async () => {
        const companies = await getDb().company.findMany({ where: { slug: { in: slugs } }, select: { id: true, slug: true, name: true } });
        for (const c of companies) await folderRound(c);
      })().catch(() => undefined);
    }, KICK_DELAY_MS);
  } catch {
    // A kick is a nicety; the five-minute round does the work anyway.
  }
}

const globalForFolders = globalThis as unknown as { __nextupFolderJob?: ReturnType<typeof setInterval> };

async function runOnce(): Promise<void> {
  try {
    for (const c of await companiesToVisit(new Date())) await folderRound(c);
  } catch (err) {
    console.warn("[folders] pass failed:", err instanceof Error ? err.message : "error");
  }
}

/** Start the five-minute round from instrumentation.ts. Idempotent (dev reloads this module). */
export function startFolderJob(): void {
  if (!hasDatabase() || globalForFolders.__nextupFolderJob) return;
  if (!folderConfig()) { console.info("[folders] off: SHAREPOINT_FOLDERS_ROOT, SHAREPOINT_FOLDERS_TENANT_ID or the Entra app is not set"); return; }
  globalForFolders.__nextupFolderJob = setInterval(() => void runOnce(), INTERVAL_MS);
  void runOnce();
}
