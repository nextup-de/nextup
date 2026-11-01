// Public event schemas: the projection of an internal CaseEvent that customers see. Ids only, never display names (D9).
// Part of @nextup/contracts/public (PILOT public contracts). Changes only by D3: add an optional field, a new
// export or an optional interface member; anything else is a new version next to the old one.
import { z } from "zod";
import { IsoDateTime, PublicId } from "./primitives";

export const PUBLIC_EVENT_TYPES = [
  "case.raised",
  "case.handed",
  "case.answered",
  "case.decided",
  "project.started",
  "project.done",
  "project.stopped",
] as const;

export const PublicEventType = z.enum(PUBLIC_EVENT_TYPES);
export type PublicEventType = z.infer<typeof PublicEventType>;

/** A projection of an internal `CaseEvent`, never the raw row. Carries ids only, never display names. */
export const PublicEvent = z.object({
  id: PublicId,
  type: PublicEventType,
  typeVersion: z.number().int().min(1),
  companyId: PublicId,
  occurredAt: IsoDateTime,
  actor: z.object({ userId: PublicId.nullable(), roleId: PublicId.nullable() }),
  subject: z.object({ kind: z.enum(["case", "project"]), id: PublicId }),
  data: z.record(z.string(), z.unknown()),
});
export type PublicEvent = z.infer<typeof PublicEvent>;
