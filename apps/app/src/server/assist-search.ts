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
import { knowledgeSourcesFor } from "@/server/connectors/knowledge";

async function sourceHits(v: { companyId: string; userId: string }, ceiling: Level, query: string, limit: number): Promise<DocHit[]> {
  try {
    const sources = await knowledgeSourcesFor(v.companyId);
    // A person without a connection has no token, so a source comes back empty without calling Microsoft.
    const lists = await Promise.all(
      sources.map((s) => s.search({ companyId: v.companyId, userId: v.userId, text: query.slice(0, 500), size: Math.min(Math.max(limit, 1), 20), ceiling }).catch(() => [])),
    );
    return lists.flat().map((h) => ({ id: h.id, title: h.title, snippet: h.snippet, classification: h.classification, source: h.source, url: h.url }));
  } catch {
    return [];
  }
}

/** `ToolContext.searchDocuments` for a signed-in viewer. */
export function searchDocumentsFor(v: { companyId: string; userId: string }, ceiling: Level) {
  return async (query: string, limit: number): Promise<DocHit[]> => {
    const [local, external] = await Promise.all([searchDocuments(v.companyId, ceiling, query, limit), sourceHits(v, ceiling, query, limit)]);
    return mergeHits(local, external, limit);
  };
}
