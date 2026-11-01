// LogSink connector interface (audit and log out).
// Part of @nextup/contracts/public (PILOT public contracts). Changes only by D3: add an optional field, a new
// export or an optional interface member; anything else is a new version next to the old one.
import { z } from "zod";
import { IsoDateTime, PublicId } from "../primitives";
import type { Connector } from "./base";

export const LogRecord = z.object({
  id: PublicId,
  companyId: PublicId,
  at: IsoDateTime,
  type: z.string().regex(/^audit(\.[a-z][a-z0-9_]*)+$/),
  actorUserId: PublicId.nullable(),
  target: z.string().max(200).nullable(),
  data: z.record(z.string(), z.unknown()),
});
export type LogRecord = z.infer<typeof LogRecord>;

export interface LogSink extends Connector<"LogSink"> {
  write(records: LogRecord[]): Promise<void>;
}
