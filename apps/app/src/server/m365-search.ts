// Live Microsoft 365 search for one person (phase 2 of docs/plans/2026-10-22_sso-and-data-access.md,
// step 2.4): their Graph token, one `POST /search/query`, at most 3 seconds. Any failure - not
// connected, Microsoft slow or down, an answer we can't read - is no hits, never an error: the
// assistant still answers from the company's own documents.
//
// Logs counts and timings only: never the query, a snippet, a file name or a token.
//
// NOT a "use server" module: nothing here checks who is asking. Callers pass the viewer.
import type { Level } from "@/features/assist/classify";
import { GRAPH_SEARCH_URL, MAX_REQUEST_SIZE, readSearchResponse, searchRequest, SEARCH_SIZE, type M365Hit } from "@/features/m365/search";
import { graphAccessToken } from "@/server/graph-token";

const TIMEOUT_MS = 3_000;
/** Asked on top of `size`: folders and hits above the ceiling are dropped after Graph answers. */
const SPARE = 6;

const post = (token: string, body: unknown, timeoutMs: number) =>
  fetch(GRAPH_SEARCH_URL, {
    method: "POST",
    headers: { authorization: `Bearer ${token}`, "content-type": "application/json" },
    body: JSON.stringify(body),
    cache: "no-store",
    signal: AbortSignal.timeout(Math.max(timeoutMs, 1)),
  });

export async function searchM365(
  p: { companyId: string; userId: string; ceiling: Level },
  query: string,
  size = SEARCH_SIZE,
): Promise<M365Hit[]> {
  const ask = Math.min(size + SPARE, MAX_REQUEST_SIZE);
  const body = searchRequest(query, ask);
  if (!body) return [];
  const started = Date.now();
  try {
    const token = await graphAccessToken(p.companyId, p.userId);
    if (!token) return [];
    let res = await post(token, body, TIMEOUT_MS);
    // A query Graph cannot parse: once more without the stem prefixes (`bestell*`), within the same 3 s.
    const plain = res.status === 400 ? searchRequest(query, ask, false) : null;
    if (plain) res = await post(token, plain, TIMEOUT_MS - (Date.now() - started));
    if (!res.ok) {
      console.warn(`[m365] search answered ${res.status} after ${Date.now() - started}ms`);
      return [];
    }
    const hits = readSearchResponse(await res.json(), p.ceiling).slice(0, size);
    console.info(`[m365] search: ${hits.length} hits in ${Date.now() - started}ms`);
    return hits;
  } catch (err) {
    console.warn(`[m365] search failed after ${Date.now() - started}ms:`, err instanceof Error ? err.name : "error");
    return [];
  }
}
