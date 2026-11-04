// Re-seal every stored secret with the current vault key after a rotation (SEC-V1, D8). A value that
// opens with the current key is left alone, one that only opens with the previous key is sealed again
// with the current one, one that opens with neither is counted as failed and left untouched. Rows are
// read per company in batches of BATCH, and a row is written only when a value changed.
// Only a model and a row id are ever reported, never a value.
import { totpContext } from "@/features/auth/totp";
import { integrationContext, openWith, seal, vaultContext } from "@/features/connectors/vault";
import { getDb, type Db } from "./client";
import { webhookContext } from "./webhooks";

const BATCH = 200;

type SealedRow = { id: string; context: string; values: string[] };

export type ResealColumn = {
  /** Prisma model name, as in schema/*.prisma. */
  model: string;
  /** Field name; the schema scan compares it with every `*Sealed` field. */
  field: string;
  /** Up to BATCH rows after the id `after` for one company; `last` is the cursor, null when this was the last page. */
  read: (db: Db, companyId: string, after: string | undefined) => Promise<{ last: string | null; rows: SealedRow[] }>;
  /** Replaces the row's values, only if they still are what was read. True when the row was updated. */
  write: (db: Db, companyId: string, row: SealedRow, next: string[]) => Promise<boolean>;
};

const page = (after: string | undefined) => ({ orderBy: { id: "asc" as const }, take: BATCH, ...(after ? { cursor: { id: after }, skip: 1 } : {}) });
const batch = <T extends { id: string }>(found: T[], toRows: (r: T) => SealedRow[]) => ({
  last: found.length === BATCH ? found[found.length - 1].id : null,
  rows: found.flatMap(toRows),
});

export const RESEALED_COLUMNS: readonly ResealColumn[] = [
  {
    model: "Connection",
    field: "refreshTokenSealed",
    read: async (db, companyId, after) =>
      batch(await db.connection.findMany({ where: { companyId }, select: { id: true, userId: true, refreshTokenSealed: true }, ...page(after) }), (r) => [
        { id: r.id, context: vaultContext(companyId, r.userId), values: [r.refreshTokenSealed] },
      ]),
    write: async (db, companyId, row, next) =>
      (await db.connection.updateMany({ where: { id: row.id, companyId, refreshTokenSealed: row.values[0] }, data: { refreshTokenSealed: next[0] } })).count > 0,
  },
  {
    model: "Integration",
    field: "secretSealed",
    read: async (db, companyId, after) =>
      batch(await db.integration.findMany({ where: { companyId, secretSealed: { not: null } }, select: { id: true, system: true, secretSealed: true }, ...page(after) }), (r) =>
        r.secretSealed ? [{ id: r.id, context: integrationContext(companyId, r.system), values: [r.secretSealed] }] : [],
      ),
    write: async (db, companyId, row, next) =>
      (await db.integration.updateMany({ where: { id: row.id, companyId, secretSealed: row.values[0] }, data: { secretSealed: next[0] } })).count > 0,
  },
  {
    model: "Integration",
    field: "webhookSecretSealed",
    read: async (db, companyId, after) =>
      batch(
        await db.integration.findMany({ where: { companyId, webhookSecretSealed: { not: null } }, select: { id: true, system: true, webhookSecretSealed: true }, ...page(after) }),
        (r) => (r.webhookSecretSealed ? [{ id: r.id, context: integrationContext(companyId, r.system), values: [r.webhookSecretSealed] }] : []),
      ),
    write: async (db, companyId, row, next) =>
      (await db.integration.updateMany({ where: { id: row.id, companyId, webhookSecretSealed: row.values[0] }, data: { webhookSecretSealed: next[0] } })).count > 0,
  },
  {
    model: "WebhookSubscription",
    field: "secrets",
    read: async (db, companyId, after) =>
      batch(await db.webhookSubscription.findMany({ where: { companyId }, select: { id: true, secrets: true }, ...page(after) }), (r) => [
        { id: r.id, context: webhookContext(companyId), values: r.secrets },
      ]),
    write: async (db, companyId, row, next) =>
      (await db.webhookSubscription.updateMany({ where: { id: row.id, companyId, secrets: { equals: row.values } }, data: { secrets: next } })).count > 0,
  },
  {
    model: "User",
    field: "totpSecretSealed",
    read: async (db, companyId, after) =>
      batch(await db.user.findMany({ where: { companyId, totpSecretSealed: { not: null } }, select: { id: true, totpSecretSealed: true }, ...page(after) }), (r) =>
        r.totpSecretSealed ? [{ id: r.id, context: totpContext(companyId, r.id), values: [r.totpSecretSealed] }] : [],
      ),
    write: async (db, companyId, row, next) =>
      (await db.user.updateMany({ where: { id: row.id, companyId, totpSecretSealed: row.values[0] }, data: { totpSecretSealed: next[0] } })).count > 0,
  },
];

export type ResealResult = { resealed: number; left: number; failed: number };

/**
 * Re-seals every value of RESEALED_COLUMNS that opens with `previous` and not with `current`.
 * `onFailed` hears the model and row id of each row holding a value neither key opens.
 */
export async function resealAll(
  keys: { current: Buffer; previous: Buffer },
  client: Db = getDb(),
  onFailed?: (model: string, id: string) => void,
): Promise<ResealResult> {
  const result: ResealResult = { resealed: 0, left: 0, failed: 0 };
  const companies = await client.company.findMany({ select: { id: true }, orderBy: { id: "asc" } });
  for (const { id: companyId } of companies) {
    for (const column of RESEALED_COLUMNS) {
      let after: string | undefined;
      while (true) {
        const { last, rows } = await column.read(client, companyId, after);
        for (const row of rows) {
          let changed = false;
          let rowFailed = false;
          const next = row.values.map((value) => {
            if (openWith(value, keys.current, row.context) !== null) {
              result.left++;
              return value;
            }
            const plain = openWith(value, keys.previous, row.context);
            if (plain === null) {
              result.failed++;
              rowFailed = true;
              return value;
            }
            result.resealed++;
            changed = true;
            return seal(plain, keys.current, row.context);
          });
          if (rowFailed) onFailed?.(column.model, row.id);
          if (changed) await column.write(client, companyId, row, next);
        }
        if (last === null) break;
        after = last;
      }
    }
  }
  return result;
}
