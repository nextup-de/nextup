// Deleting one item of a project's shared folder as the person who deletes (plan FIL-B2, D8): Graph's DELETE moves it to the
// site's recycle bin. Never throws; counts and timings only in logs, never a name, a path or a token.
//
// NOT a "use server" module: nothing here checks who is asking. Callers pass the viewer.
import { graphAccessToken } from "@/server/graph-token";

const GRAPH = "https://graph.microsoft.com/v1.0";
const TIMEOUT_MS = 5_000;
const ID = /^[A-Za-z0-9!_-]{1,200}$/;

export type RemoveAnswer = { state: "ok" | "gone" | "not-connected" | "no-access" | "offline" };
type Viewer = { companyId: string; userId: string };

type Item = { id?: unknown; name?: unknown; parentReference?: { driveId?: unknown; path?: unknown } };
const str = (v: unknown): string => (typeof v === "string" ? v : "");

async function call(token: string, url: string, method: "GET" | "DELETE"): Promise<Response> {
  return fetch(url, { method, headers: { authorization: `Bearer ${token}` }, cache: "no-store", signal: AbortSignal.timeout(TIMEOUT_MS) });
}
const failure = (status: number): RemoveAnswer["state"] => (status === 401 ? "not-connected" : status === 403 ? "no-access" : status === 404 ? "gone" : "offline");

/** The path of an item as Graph words it: its parent's path plus its name. */
const pathOf = (item: Item) => `${str(item.parentReference?.path)}/${str(item.name)}`;

/**
 * Moves `itemId` to the recycle bin, but only an item that sits inside the shared folder `shareId` names: an id from elsewhere
 * in the drive is refused (no-access) before DELETE is sent.
 */
export async function removeItem(v: Viewer, shareId: string, itemId: string): Promise<RemoveAnswer> {
  if (!ID.test(itemId)) return { state: "no-access" };
  const started = Date.now();
  try {
    const token = await graphAccessToken(v.companyId, v.userId);
    if (!token) return { state: "not-connected" };
    const rootRes = await call(token, `${GRAPH}/shares/${encodeURIComponent(shareId)}/driveItem?$select=id,name,parentReference`, "GET");
    if (!rootRes.ok) return { state: failure(rootRes.status) === "gone" ? "no-access" : failure(rootRes.status) };
    const root = (await rootRes.json()) as Item;
    const driveId = str(root.parentReference?.driveId);
    if (!ID.test(driveId)) return { state: "no-access" };
    const itemRes = await call(token, `${GRAPH}/drives/${driveId}/items/${itemId}?$select=id,name,parentReference`, "GET");
    if (!itemRes.ok) return { state: failure(itemRes.status) };
    const item = (await itemRes.json()) as Item;
    const folder = pathOf(root);
    const inside = str(item.parentReference?.path) === folder || str(item.parentReference?.path).startsWith(folder + "/");
    if (!inside || str(item.id) === str(root.id)) return { state: "no-access" };
    const res = await call(token, `${GRAPH}/drives/${driveId}/items/${itemId}`, "DELETE");
    console.info(`[files] delete answered ${res.status} after ${Date.now() - started}ms`);
    return res.ok ? { state: "ok" } : { state: failure(res.status) };
  } catch (err) {
    console.warn(`[files] delete failed after ${Date.now() - started}ms:`, err instanceof Error ? err.name : "error");
    return { state: "offline" };
  }
}
