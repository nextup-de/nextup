// The knowledge sources a company has switched on (D4, D5): Microsoft 365 search when the company allows it,
// otherwise none. A source that is not configured is absent, not an error; a failing read gives none.
//
// NOT a "use server" module.
import type { KnowledgeSource } from "@nextup/contracts/public";
import { m365SearchOn } from "@/lib/db/connections";
import { m365KnowledgeSource } from "@/server/connectors/m365";

export async function knowledgeSourcesFor(companyId: string): Promise<KnowledgeSource[]> {
  try {
    return (await m365SearchOn(companyId)) ? [m365KnowledgeSource()] : [];
  } catch {
    return [];
  }
}
