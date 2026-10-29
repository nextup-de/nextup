// The assistant's document search for one viewer: the company's own documents plus, when the
// company allows it and the person has connected, their Microsoft 365 files (step 2.5 of
// docs/plans/2026-10-22_sso-and-data-access.md). Both run at the same time; Microsoft being slow
// or down costs at most its 3 s and never the local hits.
//
// NOT a "use server" module: nothing here checks who is asking. Callers pass the viewer.
import { mergeHits } from "@/features/assist/merge";
import type { Level } from "@/features/assist/classify";
import type { DocHit } from "@/features/assist/tools";
import { searchDocuments } from "@/lib/db/assist";
import { m365SearchOn } from "@/lib/db/connections";
import { searchM365 } from "@/server/m365-search";

async function m365Hits(v: { companyId: string; userId: string }, ceiling: Level, query: string, limit: number): Promise<DocHit[]> {
  try {
    if (!(await m365SearchOn(v.companyId))) return [];
    // A person without a connection has no token, so this comes back empty without calling Microsoft.
    const hits = await searchM365({ ...v, ceiling }, query, limit);
    return hits.map((h) => ({ id: "m365:" + h.id, title: h.title, snippet: h.snippet, classification: h.classification, source: "m365", url: h.url }));
  } catch {
    return [];
  }
}

/** `ToolContext.searchDocuments` for a signed-in viewer. */
export function searchDocumentsFor(v: { companyId: string; userId: string }, ceiling: Level) {
  return async (query: string, limit: number): Promise<DocHit[]> => {
    const [local, m365] = await Promise.all([searchDocuments(v.companyId, ceiling, query, limit), m365Hits(v, ceiling, query, limit)]);
    return mergeHits(local, m365, limit);
  };
}
