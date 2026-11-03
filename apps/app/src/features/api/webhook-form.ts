// The webhook form and the delivery list of /settings/webhooks (API D11). Pure: no database, no React.
import { randomBytes } from "node:crypto";
import { PUBLIC_EVENT_TYPES } from "@nextup/contracts/public";
import type { MessageKey } from "@/i18n";

export const MAX_WEBHOOK_URL = 2000;

export type WebhookInput = { url: string; events: string[]; on: boolean };
export type WebhookCheck = { ok: true; value: WebhookInput } | { ok: false; error: MessageKey };

/** The address and events of one subscription: https only, at least one event, every event a public type. */
export function checkWebhook(input: { url?: unknown; events?: unknown; on?: unknown }): WebhookCheck {
  const raw = typeof input.url === "string" ? input.url.trim() : "";
  if (raw === "" || raw.length > MAX_WEBHOOK_URL) return { ok: false, error: "settingsWebhooks.errorUrl" };
  let u: URL;
  try {
    u = new URL(raw);
  } catch {
    return { ok: false, error: "settingsWebhooks.errorUrl" };
  }
  if (u.protocol !== "https:") return { ok: false, error: u.protocol === "http:" ? "settingsWebhooks.errorHttps" : "settingsWebhooks.errorUrl" };
  if (u.hostname === "" || u.username !== "" || u.password !== "") return { ok: false, error: "settingsWebhooks.errorUrl" };
  const events = Array.isArray(input.events) ? input.events : [];
  if (events.length === 0) return { ok: false, error: "settingsWebhooks.errorNoEvent" };
  const known: readonly string[] = PUBLIC_EVENT_TYPES;
  if (!events.every((e): e is string => typeof e === "string" && known.includes(e))) return { ok: false, error: "settingsWebhooks.errorEventType" };
  return { ok: true, value: { url: u.toString(), events: PUBLIC_EVENT_TYPES.filter((e) => events.includes(e)), on: input.on !== false } };
}

/** A new signing secret: `whsec_` and 32 random bytes, base64url. Shown once, then only sealed. */
export function newWebhookSecret(): string {
  return `whsec_${randomBytes(32).toString("base64url")}`;
}

/** The host of an address, for the lists; the whole text when it does not parse. */
export function hostOf(url: string): string {
  try {
    return new URL(url).host;
  } catch {
    return url;
  }
}

export type DeliveryStatus = "sent" | "retrying" | "failed" | "skipped" | "waiting";
export type DeliveryView = {
  id: string;
  at: string;
  event: string;
  host: string;
  attempt: number;
  status: DeliveryStatus;
  /** Why it was skipped, or the last error. */
  detail: string | null;
  /** When the next try is due; only for `retrying`. */
  nextAt: string | null;
};

type OutboxLike = {
  id: string; address: string | null; subject: string; status: string; attempt: number;
  nextAt: Date; lastError: string | null; createdAt: Date;
};

/** The deliveries list: a pending row that has been tried is retrying, one that has not is waiting. */
export function deliveryViews(rows: OutboxLike[], urls: ReadonlyMap<string, string>): DeliveryView[] {
  return rows.map((r) => {
    const status: DeliveryStatus =
      r.status === "sent" ? "sent" : r.status === "failed" ? "failed" : r.status === "skipped" ? "skipped" : r.attempt > 0 ? "retrying" : "waiting";
    return {
      id: r.id,
      at: r.createdAt.toISOString(),
      event: r.subject,
      host: r.address && urls.has(r.address) ? hostOf(urls.get(r.address) ?? "") : "",
      attempt: r.attempt,
      status,
      detail: r.lastError,
      nextAt: status === "retrying" ? r.nextAt.toISOString() : null,
    };
  });
}
