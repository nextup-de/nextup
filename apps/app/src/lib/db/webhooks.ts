// A company's webhook subscriptions (docs/adr/0004-webhook-and-outbox.md). The secrets are sealed with the
// vault (features/connectors/vault.ts) bound to "webhook:<companyId>" and come out only through
// subscriptionsOf(), for the delivery that signs with them.
import { getDb } from "@/lib/db/client";
import { open, seal, vaultKey } from "@/features/connectors/vault";

export const webhookContext = (companyId: string) => `webhook:${companyId}`;

export type Subscription = {
  id: string;
  url: string;
  secrets: string[];
  events: string[];
  on: boolean;
  updatedBy: string | null;
};

/** Rows whose secret did not open, already logged: once per row, not once per round. */
const warned = new Set<string>();

/** Save a subscription with its plain secrets, sealed. Throws when the vault key is not configured. */
export async function saveSubscription(
  companyId: string,
  s: { url: string; secrets: string[]; events: string[]; on: boolean },
  by: string | null,
): Promise<string> {
  const key = vaultKey();
  if (!key) throw new Error("CONNECTOR_VAULT_KEY is missing or not 64 hex characters");
  const row = await getDb().webhookSubscription.create({
    data: {
      companyId,
      url: s.url,
      secrets: s.secrets.map((p) => seal(p, key, webhookContext(companyId))),
      events: s.events,
      on: s.on,
      updatedBy: by,
    },
  });
  return row.id;
}

/** The company's subscriptions with their secrets opened. A secret that does not open is dropped and logged once. */
export async function subscriptionsOf(companyId: string): Promise<Subscription[]> {
  const rows = await getDb().webhookSubscription.findMany({ where: { companyId }, orderBy: [{ createdAt: "asc" }, { id: "asc" }] });
  const key = vaultKey();
  return rows.map((r) => {
    const secrets: string[] = [];
    for (const sealed of r.secrets) {
      const plain = key ? open(sealed, key, webhookContext(companyId)) : null;
      if (plain !== null) secrets.push(plain);
      else if (!warned.has(r.id)) {
        warned.add(r.id);
        console.warn(`webhook subscription ${r.id}: a secret does not open and is dropped`);
      }
    }
    return { id: r.id, url: r.url, secrets, events: r.events, on: r.on, updatedBy: r.updatedBy };
  });
}

export type SubscriptionSummary = {
  id: string;
  url: string;
  events: string[];
  on: boolean;
  secretCount: number;
  updatedBy: string | null;
  updatedAt: Date;
};

/** The company's subscriptions for the settings page: no secrets, only how many each has. */
export async function listSubscriptions(companyId: string): Promise<SubscriptionSummary[]> {
  const rows = await getDb().webhookSubscription.findMany({ where: { companyId }, orderBy: [{ createdAt: "asc" }, { id: "asc" }] });
  return rows.map((r) => ({ id: r.id, url: r.url, events: r.events, on: r.on, secretCount: r.secrets.length, updatedBy: r.updatedBy, updatedAt: r.updatedAt }));
}

/** Change a subscription's address, events and switch. False when the company has no such subscription. */
export async function updateSubscription(
  companyId: string,
  id: string,
  s: { url: string; events: string[]; on: boolean },
  by: string | null,
): Promise<boolean> {
  const { count } = await getDb().webhookSubscription.updateMany({ where: { id, companyId }, data: { url: s.url, events: s.events, on: s.on, updatedBy: by } });
  return count === 1;
}

/** Add a second secret (rotation), sealed like saveSubscription. The new one goes last. */
export async function addSecret(companyId: string, id: string, secret: string, by: string | null): Promise<boolean> {
  const key = vaultKey();
  if (!key) throw new Error("CONNECTOR_VAULT_KEY is missing or not 64 hex characters");
  return getDb().$transaction(async (tx) => {
    const row = await tx.webhookSubscription.findFirst({ where: { id, companyId }, select: { secrets: true } });
    if (!row) return false;
    await tx.webhookSubscription.update({ where: { id }, data: { secrets: [...row.secrets, seal(secret, key, webhookContext(companyId))], updatedBy: by } });
    return true;
  });
}

/** Cut a subscription back to its newest secret (the last one added). False when it does not exist. */
export async function keepNewestSecret(companyId: string, id: string, by: string | null): Promise<boolean> {
  return getDb().$transaction(async (tx) => {
    const row = await tx.webhookSubscription.findFirst({ where: { id, companyId }, select: { secrets: true } });
    if (!row) return false;
    await tx.webhookSubscription.update({ where: { id }, data: { secrets: row.secrets.slice(-1), updatedBy: by } });
    return true;
  });
}

/** Delete a subscription. False when the company has no such one. */
export async function removeSubscription(companyId: string, id: string): Promise<boolean> {
  const { count } = await getDb().webhookSubscription.deleteMany({ where: { id, companyId } });
  return count === 1;
}
