// Webhook signing (docs/adr/0004-webhook-and-outbox.md): `t=<unix s>,v1=<hex>` with one v1 per secret, so a secret
// can be rotated without a gap. The contract holds no node:* code; the HMAC is computed here.
import { createHmac } from "node:crypto";
import { signaturePayload } from "@nextup/contracts/public";

/** HMAC-SHA256 hex of `<timestamp>.<rawBody>` under one secret. */
export function signBody(secret: string, timestamp: number, rawBody: string): string {
  return createHmac("sha256", secret).update(signaturePayload(timestamp, rawBody)).digest("hex");
}

/** The value of `x-nextup-signature`: one `v1` per secret, in the order given. */
export function signatureHeader(secrets: string[], timestamp: number, rawBody: string): string {
  return [`t=${timestamp}`, ...secrets.map((s) => `v1=${signBody(s, timestamp, rawBody)}`)].join(",");
}
