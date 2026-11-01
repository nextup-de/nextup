// NotifyChannel connector interface (messages out).
// Part of @nextup/contracts/public (PILOT public contracts). Changes only by D3: add an optional field, a new
// export or an optional interface member; anything else is a new version next to the old one.
import { z } from "zod";
import { Locale, PublicId, Url } from "../primitives";
import type { Connector } from "./base";

/** `id` is the idempotency key. */
export const NotifyMessage = z.object({
  id: PublicId,
  companyId: PublicId,
  recipient: z.object({ userId: PublicId, address: z.string().nullable() }),
  template: z.string().min(1).max(64),
  locale: Locale,
  subject: z.string().max(200),
  text: z.string().max(8000),
  link: Url.nullable(),
  data: z.record(z.string(), z.unknown()),
});
export type NotifyMessage = z.infer<typeof NotifyMessage>;

export const NotifyResult = z.discriminatedUnion("ok", [
  z.object({ ok: z.literal(true), providerMessageId: z.string().nullable() }),
  z.object({ ok: z.literal(false), error: z.string().max(500), retryable: z.boolean() }),
]);
export type NotifyResult = z.infer<typeof NotifyResult>;

export interface NotifyChannel extends Connector<"NotifyChannel"> {
  send(message: NotifyMessage): Promise<NotifyResult>;
}
