// Microsoft 365 as a KnowledgeSource: the live search of src/server/m365-search.ts behind the interface of
// ADR 0002 (docs/adr/0002-connector-interfaces.md, @nextup/contracts/public). It searches as the asking user
// only, never returns a hit above the ceiling (strictly confidential is never read) and gives no hits on any failure.
//
// NOT a "use server" module: nothing here checks who is asking. Callers pass the viewer.
import { PUBLIC_CONTRACT_VERSION, type KnowledgeHit, type KnowledgeQuery, type KnowledgeSource } from "@nextup/contracts/public";
import type { Level } from "@/features/assist/classify";
import { searchM365 } from "@/server/m365-search";

const MAX_TITLE = 300;

export function m365KnowledgeSource(): KnowledgeSource {
  return {
    info: { kind: "KnowledgeSource", id: "m365", contractVersion: PUBLIC_CONTRACT_VERSION },
    async search(query: KnowledgeQuery): Promise<KnowledgeHit[]> {
      try {
        const ceiling: Level = query.ceiling === "strictly_confidential" ? "confidential" : query.ceiling;
        const hits = await searchM365({ companyId: query.companyId, userId: query.userId, ceiling }, query.text, query.size);
        return hits.map((h) => ({
          id: "m365:" + h.id,
          source: "m365",
          title: h.title.slice(0, MAX_TITLE),
          snippet: h.snippet,
          url: h.url,
          classification: h.classification,
        }));
      } catch {
        return [];
      }
    },
  };
}
