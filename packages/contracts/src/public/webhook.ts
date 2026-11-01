// Webhook envelope: the signed body NextUp posts to a subscriber, plus pure helpers for the signature header.
// Part of @nextup/contracts/public (PILOT public contracts). Changes only by D3: add an optional field, a new
// export or an optional interface member; anything else is a new version next to the old one.
import { z } from "zod";
import { IsoDateTime, PublicId } from "./primitives";
import { PublicEvent } from "./events";

export const WEBHOOK_SPEC_VERSION = 1 as const;
export const WEBHOOK_SIGNATURE_HEADER = "x-nextup-signature";
export const WEBHOOK_DELIVERY_HEADER = "x-nextup-delivery";

export const WebhookEnvelope = z.object({
  specVersion: z.literal(WEBHOOK_SPEC_VERSION),
  deliveryId: PublicId,
  attempt: z.number().int().min(1),
  sentAt: IsoDateTime,
  event: PublicEvent,
});
export type WebhookEnvelope = z.infer<typeof WebhookEnvelope>;

/** The string that is signed: `<unix seconds>.<raw body>`. The HMAC-SHA256 itself is computed by the sender and receiver. */
export function signaturePayload(timestamp: number, rawBody: string): string {
  return `${timestamp}.${rawBody}`;
}

/** Reads `t=<unix seconds>,v1=<hex>[,v1=<hex>]`. Several `v1` appear during a secret rotation. Null if malformed. */
export function parseSignatureHeader(header: string): { timestamp: number; v1: string[] } | null {
  let timestamp: number | null = null;
  const v1: string[] = [];
  for (const part of header.split(",")) {
    const eq = part.indexOf("=");
    if (eq < 0) continue;
    const key = part.slice(0, eq).trim();
    const value = part.slice(eq + 1).trim();
    if (key === "t" && /^\d+$/.test(value)) timestamp = Number(value);
    else if (key === "v1" && value) v1.push(value);
  }
  if (timestamp === null || v1.length === 0) return null;
  return { timestamp, v1 };
}
