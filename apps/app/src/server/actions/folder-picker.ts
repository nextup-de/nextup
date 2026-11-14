"use server";
// Finding the project's SharePoint folder (plan FIL, D4, frame 6.4): search folders by name, or look into one. As the signed-in person, through their own
// Microsoft token, at most 5 seconds, never throwing. Nothing here is stored: the choice is saved by the page as a project.linked event.
// Logs counts and timings only: never a name, a path or a token.
import { getViewer } from "@/features/auth/session";
import { graphAccessToken } from "@/server/graph-token";

const GRAPH = "https://graph.microsoft.com/v1.0";
const TIMEOUT_MS = 5_000;
const SELECT = "id,name,webUrl,folder,parentReference";

export type PickerFolder = { id: string; driveId: string; name: string; webUrl: string; path: string; count: number };
export type PickerAnswer = { state: "ok"; folders: PickerFolder[] } | { state: "not-connected" | "no-access" | "offline" };

const text = (v: unknown): string => (typeof v === "string" ? v : "");
const record = (v: unknown): v is Record<string, unknown> => v !== null && typeof v === "object" && !Array.isArray(v);
const SAFE_ID = /^[A-Za-z0-9!_.$-]{1,200}$/;

/** The folders among Graph's driveItems; files and items without a drive or an address are left out. */
function foldersOf(json: unknown): PickerFolder[] {
  const items = record(json) && Array.isArray(json.value) ? json.value : [];
  const out: PickerFolder[] = [];
  for (const item of items) {
    if (!record(item) || !record(item.folder)) continue;
    const ref = record(item.parentReference) ? item.parentReference : {};
    const id = text(item.id), name = text(item.name), driveId = text(ref.driveId), webUrl = text(item.webUrl);
    if (!id || !name || !driveId || !webUrl) continue;
    const at = text(ref.path).indexOf("root:");
    out.push({ id, driveId, name, webUrl, path: at < 0 ? "" : text(ref.path).slice(at + 5).replace(/^\/+|\/+$/g, ""), count: typeof item.folder.childCount === "number" ? item.folder.childCount : 0 });
  }
  return out;
}

async function ask(url: string, what: string): Promise<PickerAnswer> {
  const viewer = await getViewer();
  if (!viewer) return { state: "no-access" };
  const started = Date.now();
  try {
    const token = await graphAccessToken(viewer.companyId, viewer.userId);
    if (!token) return { state: "not-connected" };
    const res = await fetch(url, { headers: { authorization: `Bearer ${token}` }, cache: "no-store", signal: AbortSignal.timeout(TIMEOUT_MS) });
    if (!res.ok) {
      console.warn(`[files] ${what} answered ${res.status} after ${Date.now() - started}ms`);
      return { state: res.status === 401 ? "not-connected" : res.status === 403 || res.status === 404 ? "no-access" : "offline" };
    }
    const folders = foldersOf(await res.json());
    console.info(`[files] ${what}: ${folders.length} folders in ${Date.now() - started}ms`);
    return { state: "ok", folders };
  } catch (err) {
    console.warn(`[files] ${what} failed after ${Date.now() - started}ms:`, err instanceof Error ? err.name : "error");
    return { state: "offline" };
  }
}

/** Folders whose name matches, in the person's own OneDrive and the SharePoint sites they can open. */
export async function searchFoldersAction(query: string): Promise<PickerAnswer> {
  const q = typeof query === "string" ? query.trim() : "";
  if (q.length === 0 || q.length > 120) return { state: "ok", folders: [] };
  const escaped = encodeURIComponent(q.replace(/'/g, "''"));
  return ask(`${GRAPH}/me/drive/root/search(q='${escaped}')?$select=${SELECT}&$top=25`, "folder search");
}

/** The folders directly inside a folder. */
export async function childFoldersAction(driveId: string, itemId: string): Promise<PickerAnswer> {
  if (!SAFE_ID.test(driveId) || !SAFE_ID.test(itemId)) return { state: "no-access" };
  return ask(`${GRAPH}/drives/${driveId}/items/${itemId}/children?$select=${SELECT}&$top=200`, "folder children");
}
