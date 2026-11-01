// KnowledgeSource connector interface (documents).
// Part of @nextup/contracts/public (PILOT public contracts). Changes only by D3: add an optional field, a new
// export or an optional interface member; anything else is a new version next to the old one.
import { z } from "zod";
import { Classification, PublicId, Url } from "../primitives";
import type { Connector } from "./base";

export const KnowledgeQuery = z.object({
  companyId: PublicId,
  userId: PublicId,
  text: z.string().min(1).max(500),
  size: z.number().int().min(1).max(20),
  ceiling: Classification,
});
export type KnowledgeQuery = z.infer<typeof KnowledgeQuery>;

export const KnowledgeHit = z.object({
  id: PublicId,
  source: z.string().min(1).max(32),
  title: z.string().max(300),
  snippet: z.string().max(1000),
  url: Url,
  classification: Classification,
});
export type KnowledgeHit = z.infer<typeof KnowledgeHit>;

export interface KnowledgeSource extends Connector<"KnowledgeSource"> {
  /** Searches as `userId`, so the source's permissions apply; hits above `ceiling` are never returned. */
  search(query: KnowledgeQuery): Promise<KnowledgeHit[]>;
}
