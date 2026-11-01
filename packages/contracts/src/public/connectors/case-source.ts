// CaseSource connector interface (cases in).
// Part of @nextup/contracts/public (PILOT public contracts). Changes only by D3: add an optional field, a new
// export or an optional interface member; anything else is a new version next to the old one.
import { z } from "zod";
import { IsoDateTime, PublicId } from "../primitives";
import type { CaseRef } from "../model";
import type { Connector } from "./base";

export const CaseInput = z.object({
  companyId: PublicId,
  source: z.string().min(1).max(32),
  externalId: z.string().min(1).max(200),
  kind: z.enum(["problem", "idea"]),
  title: z.string().min(1).max(200),
  body: z.string().max(8000),
  raisedByUserId: PublicId.nullable(),
  raisedByExternalId: z.string().nullable(),
  routeHint: z.string().nullable(),
  receivedAt: IsoDateTime,
});
export type CaseInput = z.infer<typeof CaseInput>;

export interface CaseSource extends Connector<"CaseSource"> {
  /** null = the payload is not a case, e.g. a ping. */
  receive(input: { companyId: string; payload: unknown; headers: Record<string, string> }): Promise<CaseInput | null>;
  acknowledge?(input: { externalId: string; caseRef: CaseRef }): Promise<void>;
}
