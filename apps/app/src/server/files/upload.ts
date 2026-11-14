// Putting a file into a project's shared folder as the person who uploads (plan FIL-B1, D5, D6): up to 800 KB in one PUT, bigger
// ones through an upload session in chunks of 640 KiB (a server action body stays under 1 MB). A name that is taken becomes "name (2)" (conflictBehavior rename). Never
// throws; counts and timings only in logs, never a name, a path, a session URL or a token.
//
// NOT a "use server" module: nothing here checks who is asking. Callers pass the viewer.
import { rowOf, type FileRow } from "@/features/files/items";
import { CHUNK_SIZE, SMALL } from "@/features/files/upload-limits";
import { graphAccessToken } from "@/server/graph-token";

const GRAPH = "https://graph.microsoft.com/v1.0";
const TIMEOUT_MS = 30_000;
export const SMALL_MAX = SMALL;
export const CHUNK = CHUNK_SIZE; // a multiple of 320 KiB, as Graph asks

type Viewer = { companyId: string; userId: string };
type Failure = "not-connected" | "no-access" | "offline";
export type UploadAnswer = { state: "ok"; row: FileRow } | { state: Failure };
export type SessionAnswer = { state: "ok"; uploadUrl: string } | { state: Failure };
export type ChunkAnswer = { state: "more"; next: number } | { state: "ok"; row: FileRow } | { state: Failure };

const failure = (status: number): Failure => (status === 401 ? "not-connected" : status === 403 || status === 404 || status === 409 || status === 423 ? "no-access" : "offline");
const encode = (path: string) => path.split("/").filter(Boolean).map(encodeURIComponent).join("/");
const target = (shareId: string, path: string, name: string) => `${GRAPH}/shares/${encodeURIComponent(shareId)}/root:/${encode(path ? `${path}/${name}` : name)}`;

/** Only the host Graph's own session answer names: a SharePoint or Graph URL over https. */
export const sessionUrlOk = (url: string): boolean => {
  try { const u = new URL(url); return u.protocol === "https:" && /(^|\.)(sharepoint\.com|sharepoint-df\.com|graph\.microsoft\.com)$/i.test(u.hostname); } catch { return false; }
};

async function withToken<T>(v: Viewer, what: string, go: (token: string) => Promise<T>, otherwise: T): Promise<T | { state: "not-connected" } | { state: "offline" }> {
  const started = Date.now();
  try {
    const token = await graphAccessToken(v.companyId, v.userId);
    if (!token) return { state: "not-connected" };
    const out = await go(token);
    console.info(`[files] ${what} in ${Date.now() - started}ms`);
    return out ?? otherwise;
  } catch (err) {
    console.warn(`[files] ${what} failed after ${Date.now() - started}ms:`, err instanceof Error ? err.name : "error");
    return { state: "offline" };
  }
}

/** One PUT for a file of up to 800 KB. */
export async function uploadSmall(v: Viewer, shareId: string, path: string, name: string, bytes: Uint8Array): Promise<UploadAnswer> {
  if (bytes.byteLength > SMALL_MAX) return { state: "no-access" };
  return withToken<UploadAnswer>(v, "upload", async (token) => {
    const res = await fetch(`${target(shareId, path, name)}:/content?@microsoft.graph.conflictBehavior=rename`, {
      method: "PUT", headers: { authorization: `Bearer ${token}`, "content-type": "application/octet-stream" }, body: bytes as BodyInit, cache: "no-store", signal: AbortSignal.timeout(TIMEOUT_MS),
    });
    if (!res.ok) return { state: failure(res.status) };
    const row = rowOf(await res.json());
    return row ? { state: "ok", row } : { state: "offline" };
  }, { state: "offline" });
}

/** The upload session of a big file: the pre-signed URL the chunks go to. */
export async function createSession(v: Viewer, shareId: string, path: string, name: string): Promise<SessionAnswer> {
  return withToken<SessionAnswer>(v, "upload session", async (token) => {
    const res = await fetch(`${target(shareId, path, name)}:/createUploadSession`, {
      method: "POST", headers: { authorization: `Bearer ${token}`, "content-type": "application/json" },
      body: JSON.stringify({ item: { "@microsoft.graph.conflictBehavior": "rename" } }), cache: "no-store", signal: AbortSignal.timeout(TIMEOUT_MS),
    });
    if (!res.ok) return { state: failure(res.status) };
    const uploadUrl = ((await res.json()) as { uploadUrl?: unknown }).uploadUrl;
    return typeof uploadUrl === "string" && sessionUrlOk(uploadUrl) ? { state: "ok", uploadUrl } : { state: "offline" };
  }, { state: "offline" });
}

/** One chunk of a session (640 KiB). The session URL carries its own authorization, so no token goes with it. */
export async function putChunk(uploadUrl: string, start: number, bytes: Uint8Array, total: number): Promise<ChunkAnswer> {
  if (!sessionUrlOk(uploadUrl) || bytes.byteLength === 0 || start + bytes.byteLength > total) return { state: "no-access" };
  const started = Date.now();
  try {
    const res = await fetch(uploadUrl, {
      method: "PUT", headers: { "content-length": String(bytes.byteLength), "content-range": `bytes ${start}-${start + bytes.byteLength - 1}/${total}` }, body: bytes as BodyInit, cache: "no-store", signal: AbortSignal.timeout(TIMEOUT_MS),
    });
    console.info(`[files] chunk answered ${res.status} after ${Date.now() - started}ms`);
    if (res.status === 202) return { state: "more", next: start + bytes.byteLength };
    if (!res.ok) return { state: failure(res.status) };
    const row = rowOf(await res.json());
    return row ? { state: "ok", row } : { state: "offline" };
  } catch (err) {
    console.warn(`[files] chunk failed after ${Date.now() - started}ms:`, err instanceof Error ? err.name : "error");
    return { state: "offline" };
  }
}

/** Stops a session (best effort: an answer is never needed). */
export async function cancelSession(uploadUrl: string): Promise<void> {
  if (!sessionUrlOk(uploadUrl)) return;
  try { await fetch(uploadUrl, { method: "DELETE", cache: "no-store", signal: AbortSignal.timeout(5_000) }); } catch { /* the session lapses by itself */ }
}

/** A big file through one session, `read(start, end)` giving the bytes of each chunk. */
export async function uploadLarge(v: Viewer, shareId: string, path: string, name: string, total: number, read: (start: number, end: number) => Promise<Uint8Array>): Promise<UploadAnswer> {
  const session = await createSession(v, shareId, path, name);
  if (session.state !== "ok") return { state: session.state };
  for (let start = 0; start < total; start += CHUNK) {
    const bytes = await read(start, Math.min(start + CHUNK, total));
    const answer = await putChunk(session.uploadUrl, start, bytes, total);
    if (answer.state === "ok") return answer;
    if (answer.state !== "more") { await cancelSession(session.uploadUrl); return { state: answer.state }; }
  }
  return { state: "offline" };
}
