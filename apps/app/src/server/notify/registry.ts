// The channels a message can leave through, by the name an outbox row carries in `channel`. `mail` and `webhook`
// register themselves when this module is imported; a later channel (Teams) or a test calls registerChannel.
import type { NotifyChannel } from "@nextup/contracts/public";
import { mailChannel } from "./channels/mail";
import { webhookChannel } from "./channels/webhook";

const channels = new Map<string, NotifyChannel>();

/** Add or replace the channel behind a name. */
export function registerChannel(name: string, channel: NotifyChannel): void {
  channels.set(name, channel);
}

/** The channel registered under `name`, or null. */
export function channelFor(name: string): NotifyChannel | null {
  return channels.get(name) ?? null;
}

registerChannel("mail", mailChannel);
registerChannel("webhook", webhookChannel);
