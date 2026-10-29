// A company's integrations with other tools (Integration rows, docs/plans/2026-10-29_jira-in-app.md):
// settings, sealed secrets, the sync cursors and the lease that keeps one runner per company. Every
// query is scoped by company. The sealed secrets (features/connectors/vault.ts, integrationContext)
// go in here sealed and come out only through integrationSecrets(), for the sync that opens them;
// every other reader gets a "has a token" boolean and nothing more.
import { Prisma } from "@prisma/client";
import { getDb } from "@/lib/db/client";

export const JIRA = "jira";

/** A round that fails records its reason; cut so one bad response cannot fill the row. */
const MAX_ERROR = 500;

/** An Integration row without its secrets. `settings` and `account` are the system's own shapes (jira/types.ts). */
export type IntegrationInfo = {
  companyId: string;
  system: string;
  on: boolean;
  enabledAt: Date | null;
  settings: unknown;
  hasSecret: boolean;
  hasWebhookSecret: boolean;
  account: unknown;
  pushedSeq: number;
  pulledAt: Date | null;
  leaseUntil: Date | null;
  lastRunAt: Date | null;
  lastOkAt: Date | null;
  lastError: string | null;
  updatedBy: string | null;
  updatedAt: Date;
};

type Row = Prisma.IntegrationGetPayload<object>;

const infoOf = (r: Row): IntegrationInfo => ({
  companyId: r.companyId, system: r.system, on: r.on, enabledAt: r.enabledAt, settings: r.settings,
  hasSecret: r.secretSealed !== null, hasWebhookSecret: r.webhookSecretSealed !== null, account: r.account,
  pushedSeq: r.pushedSeq, pulledAt: r.pulledAt, leaseUntil: r.leaseUntil, lastRunAt: r.lastRunAt,
  lastOkAt: r.lastOkAt, lastError: r.lastError, updatedBy: r.updatedBy, updatedAt: r.updatedAt,
});

const where = (companyId: string, system: string) => ({ companyId_system: { companyId, system } });

/** The company's integration for a system, without secrets, or null when nothing was saved. */
export async function getIntegration(companyId: string, system: string): Promise<IntegrationInfo | null> {
  const row = await getDb().integration.findUnique({ where: where(companyId, system) });
  return row ? infoOf(row) : null;
}

/** The sealed secrets, for the sync that opens them with the vault. Never pass these on to a page. */
export async function integrationSecrets(
  companyId: string,
  system: string,
): Promise<{ secretSealed: string | null; webhookSecretSealed: string | null } | null> {
  return getDb().integration.findUnique({
    where: where(companyId, system),
    select: { secretSealed: true, webhookSecretSealed: true },
  });
}

/**
 * Save the settings (and, when given, the sealed secrets). `secretSealed` / `webhookSecretSealed`:
 * a string replaces the secret, `null` removes it, `undefined` keeps what is there - so saving the
 * form without retyping the token leaves the token alone. A new row starts off. Saving clears
 * lastError (the admin has changed something; the next round will say if it works).
 */
export async function saveIntegration(p: {
  companyId: string;
  system: string;
  settings: unknown;
  secretSealed?: string | null;
  webhookSecretSealed?: string | null;
  account?: unknown;
  updatedBy: string | null;
}): Promise<void> {
  const settings = p.settings as Prisma.InputJsonValue;
  const account = p.account === undefined ? undefined : p.account === null ? Prisma.DbNull : (p.account as Prisma.InputJsonValue);
  const data = {
    settings,
    ...(p.secretSealed !== undefined ? { secretSealed: p.secretSealed } : {}),
    ...(p.webhookSecretSealed !== undefined ? { webhookSecretSealed: p.webhookSecretSealed } : {}),
    ...(account !== undefined ? { account } : {}),
    updatedBy: p.updatedBy,
    lastError: null,
  };
  await getDb().integration.upsert({
    where: where(p.companyId, p.system),
    create: { companyId: p.companyId, system: p.system, ...data },
    update: data,
  });
}

/**
 * Switch it on or off. Switching on sets enabledAt to now (only ideas decided after it get an epic by
 * themselves) and clears the last error; the cursors stay, because repeating a push is safe. False
 * when there is no row to switch.
 */
export async function setIntegrationOn(companyId: string, system: string, on: boolean, updatedBy: string | null, now = new Date()): Promise<boolean> {
  const before = await getDb().integration.findUnique({ where: where(companyId, system), select: { on: true } });
  if (!before) return false;
  await getDb().integration.update({
    where: where(companyId, system),
    data: on
      ? { on: true, ...(before.on ? {} : { enabledAt: now }), lastError: null, leaseUntil: null, updatedBy }
      : { on: false, leaseUntil: null, updatedBy },
  });
  return true;
}

/** Remove the integration row (secrets included). True when there was one. */
export async function deleteIntegration(companyId: string, system: string): Promise<boolean> {
  const r = await getDb().integration.deleteMany({ where: { companyId, system } });
  return r.count > 0;
}

/** The companies that have this system switched on - what the once-a-minute loop walks. */
export async function companiesWithIntegrationOn(system: string): Promise<{ id: string; slug: string }[]> {
  // A relation filter from Company, which the tenant guard does not look into; the rows returned are companies, not tenant rows.
  return getDb().company.findMany({
    where: { integrations: { some: { system, on: true } } },
    select: { id: true, slug: true },
    orderBy: { createdAt: "asc" },
  });
}

/**
 * Take the lease on a company's integration for `ms`, so only one runner works on it. True when it
 * was taken: the integration is on, and nobody holds an unexpired lease. A runner that dies loses
 * the lease by itself when it expires. Atomic (one conditional UPDATE), also across processes.
 */
export async function claimLease(companyId: string, system: string, ms: number, now = new Date()): Promise<boolean> {
  const r = await getDb().integration.updateMany({
    where: { companyId, system, on: true, OR: [{ leaseUntil: null }, { leaseUntil: { lt: now } }] },
    data: { leaseUntil: new Date(now.getTime() + ms), lastRunAt: now },
  });
  return r.count === 1;
}

/** Give the lease back at the end of a round. */
export async function releaseLease(companyId: string, system: string): Promise<void> {
  await getDb().integration.updateMany({ where: { companyId, system }, data: { leaseUntil: null } });
}

/**
 * What a finished round records. A good round (`error` missing) sets lastOkAt, clears lastError and
 * moves the cursors it names: `pushedSeq` (the last event whose jobs all went through) and `pulledAt`
 * (when Jira was last read). A failed round records why, and moves nothing - the next one repeats it.
 * `account` stores the integration account the first good round learned (GET /myself).
 */
export async function recordRun(
  companyId: string,
  system: string,
  r: { error?: string; pushedSeq?: number; pulledAt?: Date; account?: { id: string; name: string } },
  now = new Date(),
): Promise<void> {
  const data: Prisma.IntegrationUpdateManyMutationInput = r.error !== undefined
    ? { lastError: r.error.slice(0, MAX_ERROR) || "failed" }
    : {
        lastOkAt: now, lastError: null,
        ...(r.pushedSeq !== undefined ? { pushedSeq: r.pushedSeq } : {}),
        ...(r.pulledAt ? { pulledAt: r.pulledAt } : {}),
        ...(r.account ? { account: r.account } : {}),
      };
  await getDb().integration.updateMany({ where: { companyId, system }, data });
}
