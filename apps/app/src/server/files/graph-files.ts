// Reading a project's SharePoint folder as the person who looks (plan FIL, D6): their Graph token, one call, at most
// 5 seconds. Reading never throws: no token is not-connected, 401 is not-connected too (the token was refused), 403 and
// 404 are no-access, a timeout, a network error, 429 or a 5xx is offline, an empty folder is empty.
//
// Logs counts and timings only: never a file name, a path, a share id or a token (like server/m365-search.ts).
//
// NOT a "use server" module: nothing here checks who is asking. Callers pass the viewer.
import { rowOf, type FileRow, type FileVersion, type FolderAnswer, type VersionsAnswer } from "@/features/files/items";
import { graphAccessToken } from "@/server/graph-token";

const GRAPH = "https://graph.microsoft.com/v1.0";
const TIMEOUT_MS = 5_000;
export const PAGE_SIZE = 200;

type Viewer = { companyId: string; userId: string };
type Failure = "not-connected" | "no-access" | "offline";
type Fetched = { ok: true; json: unknown } | { ok: false; why: Failure };

const encodePath = (path: string) => path.split("/").filter(Boolean).map(encodeURIComponent).join("/");
/** Graph's own paging links only: any other host would be a request to somewhere we were not pointed at. */
const graphLink = (next: string) => { try { const u = new URL(next); return u.protocol === "https:" && u.hostname === "graph.microsoft.com" ? u.toString() : null; } catch { return null; } };

function failure(status: number): Failure {
  if (status === 401) return "not-connected";
  if (status === 403 || status === 404) return "no-access";
  return "offline";
}

async function get(v: Viewer, url: string, what: string): Promise<Fetched> {
  const started = Date.now();
  try {
    const token = await graphAccessToken(v.companyId, v.userId);
    if (!token) return { ok: false, why: "not-connected" };
    const res = await fetch(url, { headers: { authorization: `Bearer ${token}` }, cache: "no-store", signal: AbortSignal.timeout(TIMEOUT_MS) });
    if (!res.ok) {
      console.warn(`[files] ${what} answered ${res.status} after ${Date.now() - started}ms`);
      return { ok: false, why: failure(res.status) };
    }
    return { ok: true, json: await res.json() };
  } catch (err) {
    console.warn(`[files] ${what} failed after ${Date.now() - started}ms:`, err instanceof Error ? err.name : "error");
    return { ok: false, why: "offline" };
  }
}

const list = (json: unknown): unknown[] => (json && typeof json === "object" && Array.isArray((json as { value?: unknown }).value) ? (json as { value: unknown[] }).value : []);

/**
 * The items of the shared folder (or of `path` inside it), at most 200 per call. `next` is Graph's own nextLink from
 * the previous answer: it is followed only when the caller passes it.
 */
export async function listFolder(v: Viewer, shareId: string, path: string, next?: string | null): Promise<FolderAnswer> {
  const started = Date.now();
  let url: string;
  if (next) {
    const link = graphLink(next);
    if (!link) return { state: "offline" };
    url = link;
  } else {
    const rel = encodePath(path);
    url = rel ? `${GRAPH}/shares/${encodeURIComponent(shareId)}/root:/${rel}:/children?$top=${PAGE_SIZE}` : `${GRAPH}/shares/${encodeURIComponent(shareId)}/driveItem/children?$top=${PAGE_SIZE}`;
  }
  const res = await get(v, url, "folder");
  if (!res.ok) return { state: res.why };
  const rows = list(res.json).flatMap((item) => rowOf(item) ?? []);
  const link = (res.json as { "@odata.nextLink"?: unknown })["@odata.nextLink"];
  console.info(`[files] folder: ${rows.length} items in ${Date.now() - started}ms`);
  if (rows.length === 0) return { state: "empty" };
  return { state: "ok", rows, next: typeof link === "string" && graphLink(link) ? link : null };
}

/** One item of the shared folder by its path ("" is the folder itself), or null. */
export async function itemOf(v: Viewer, shareId: string, path: string): Promise<{ state: "ok"; row: FileRow } | { state: Failure }> {
  const rel = encodePath(path);
  const res = await get(v, rel ? `${GRAPH}/shares/${encodeURIComponent(shareId)}/root:/${rel}` : `${GRAPH}/shares/${encodeURIComponent(shareId)}/driveItem`, "item");
  if (!res.ok) return { state: res.why };
  const row = rowOf(res.json);
  return row ? { state: "ok", row } : { state: "no-access" };
}

/** The versions of one item: the drive is the shared folder's own, so an id from elsewhere is refused by Graph. */
export async function versionsOf(v: Viewer, shareId: string, itemId: string): Promise<VersionsAnswer> {
  if (!/^[A-Za-z0-9!_-]{1,200}$/.test(itemId)) return { state: "no-access" };
  const root = await get(v, `${GRAPH}/shares/${encodeURIComponent(shareId)}/driveItem?$select=id,parentReference`, "share");
  if (!root.ok) return { state: root.why };
  const driveId = (root.json as { parentReference?: { driveId?: unknown } }).parentReference?.driveId;
  if (typeof driveId !== "string" || !/^[A-Za-z0-9!_-]{1,200}$/.test(driveId)) return { state: "no-access" };
  const res = await get(v, `${GRAPH}/drives/${driveId}/items/${itemId}/versions`, "versions");
  if (!res.ok) return { state: res.why };
  const versions: FileVersion[] = list(res.json).flatMap((x) => {
    const o = x as { id?: unknown; lastModifiedDateTime?: unknown; lastModifiedBy?: { user?: { displayName?: unknown } }; size?: unknown };
    return typeof o.id === "string" ? [{ id: o.id, modifiedAt: typeof o.lastModifiedDateTime === "string" ? o.lastModifiedDateTime : "", modifiedBy: typeof o.lastModifiedBy?.user?.displayName === "string" ? o.lastModifiedBy.user.displayName : "", size: typeof o.size === "number" ? o.size : 0 }] : [];
  });
  console.info(`[files] versions: ${versions.length}`);
  return { state: "ok", versions };
}
