// The `webhook` channel: posts the signed WebhookEnvelope to the subscription the row's address names.
// The row's data carries `event` (a PublicEvent); deliver.ts adds `attempt` and `sentAt` (time is passed in).
import {
  PUBLIC_CONTRACT_VERSION,
  PublicEvent,
  WEBHOOK_DELIVERY_HEADER,
  WEBHOOK_SIGNATURE_HEADER,
  WEBHOOK_SPEC_VERSION,
  type NotifyChannel,
  type NotifyMessage,
  type NotifyResult,
  type WebhookEnvelope,
} from "@nextup/contracts/public";
import { subscriptionsOf } from "@/lib/db/webhooks";
import { signatureHeader } from "../sign";

export const WEBHOOK_TIMEOUT_MS = 10_000;

/** 2xx is sent; 4xx except 408 and 429 will not get better by asking again; the rest is tried again. */
export function retryableStatus(status: number): boolean {
  return !(status >= 400 && status < 500 && status !== 408 && status !== 429);
}

const fail = (error: string, retryable: boolean): NotifyResult => ({ ok: false, error: error.slice(0, 500), retryable });

export const webhookChannel: NotifyChannel = {
  info: { kind: "NotifyChannel", id: "webhook", contractVersion: PUBLIC_CONTRACT_VERSION },

  async send(message: NotifyMessage): Promise<NotifyResult> {
    const event = PublicEvent.safeParse(message.data.event);
    if (!event.success) return fail("the row carries no valid event", false);

    const subs = await subscriptionsOf(message.companyId);
    const sub = subs.find((s) => s.id === message.recipient.address);
    if (!sub || !sub.on) return fail("the subscription is gone or switched off", false);
    if (sub.secrets.length === 0) return fail("the subscription has no secret that opens", false);

    const attempt = typeof message.data.attempt === "number" && message.data.attempt >= 1 ? message.data.attempt : 1;
    const sentAt = typeof message.data.sentAt === "string" ? message.data.sentAt : new Date().toISOString();
    const envelope: WebhookEnvelope = {
      specVersion: WEBHOOK_SPEC_VERSION,
      deliveryId: message.id,
      attempt,
      sentAt,
      event: event.data,
    };
    const rawBody = JSON.stringify(envelope);
    const timestamp = Math.floor(new Date(sentAt).getTime() / 1000);

    try {
      const res = await fetch(sub.url, {
        method: "POST",
        redirect: "manual",
        headers: {
          "content-type": "application/json",
          [WEBHOOK_DELIVERY_HEADER]: message.id,
          [WEBHOOK_SIGNATURE_HEADER]: signatureHeader(sub.secrets, timestamp, rawBody),
        },
        body: rawBody,
        signal: AbortSignal.timeout(WEBHOOK_TIMEOUT_MS),
      });
      await res.body?.cancel();
      if (res.status >= 200 && res.status < 300) return { ok: true, providerMessageId: null };
      return fail(`the receiver answered ${res.status}`, retryableStatus(res.status));
    } catch (e) {
      return fail(`the receiver was not reached: ${e instanceof Error ? e.message : String(e)}`, true);
    }
  },
};
