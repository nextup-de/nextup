// What Postgres itself says about its state, for the Database card on /admin.
//
// Everything here is read-only and cheap enough to run on every admin render. The counts name
// their companies because User, CaseEvent and ApiToken are tenant tables and scope.ts refuses an
// unscoped read - "all of them" is the admin's intention, not a property of the query.
//
// The migration read is raw SQL against `_prisma_migrations`, which is Prisma's own bookkeeping
// table and belongs to no tenant. It is the one question the ORM cannot answer about itself:
// whether the schema in front of us is the schema this build expects.
import { getDb } from "./client";

export type TableCounts = {
  companies: number;
  people: number;
  events: number;
  tokens: number;
  pilotRequests: number;
};

export type MigrationState = {
  applied: number;
  latest: string | null;
  appliedAt: string | null;
  /** Migrations that started and never finished - a half-applied schema. */
  failed: string[];
};

export type DatabaseFacts = {
  /** Round trip for one trivial query, in milliseconds. */
  latencyMs: number;
  /** host:port, never the password. */
  server: string;
  database: string;
  /** Postgres' own version string, trimmed to the useful part. */
  version: string;
  counts: TableCounts;
  migrations: MigrationState | null;
};

/** host:port of the connection string. Never the user, never the password. */
export function serverOf(url: string | undefined): string {
  try {
    const u = new URL(url ?? "");
    return `${u.hostname}:${u.port || "5432"}`;
  } catch {
    return "unknown";
  }
}

export function databaseNameOf(url: string | undefined): string {
  try {
    return new URL(url ?? "").pathname.replace(/^\//, "") || "unknown";
  } catch {
    return "unknown";
  }
}

type VersionRow = { version: string };
type MigrationRow = { migration_name: string; finished_at: Date | null; applied: bigint | number };

export async function databaseFacts(): Promise<DatabaseFacts> {
  const db = getDb();

  // Warm the pool first, then time a second trivial query. Timing the FIRST query of a fresh
  // process measures TCP connect plus TLS plus Postgres auth - around 300ms - and reports it as
  // "a slow round trip", which is a lie about the database and a lie the card would repeat after
  // every deploy.
  await db.$queryRaw`SELECT 1`;
  const started = Date.now();
  await db.$queryRaw`SELECT 1`;
  const latencyMs = Date.now() - started;

  const companies = await db.company.findMany({ select: { id: true } });
  const ids = companies.map((c) => c.id);

  const [version, people, events, tokens, pilotRequests, migrations] = await Promise.all([
    db.$queryRaw<VersionRow[]>`SELECT version() as version`,
    ids.length ? db.user.count({ where: { companyId: { in: ids } } }) : Promise.resolve(0),
    ids.length ? db.caseEvent.count({ where: { companyId: { in: ids } } }) : Promise.resolve(0),
    ids.length ? db.apiToken.count({ where: { companyId: { in: ids } } }) : Promise.resolve(0),
    db.pilotRequest.count(),
    readMigrations(),
  ]);

  return {
    latencyMs,
    server: serverOf(process.env.DATABASE_URL),
    database: databaseNameOf(process.env.DATABASE_URL),
    version: shortVersion(version[0]?.version ?? ""),
    counts: { companies: companies.length, people, events, tokens, pilotRequests },
    migrations,
  };
}

/** "PostgreSQL 17.2 on x86_64-pc-linux-gnu, compiled by ..." -> "PostgreSQL 17.2". */
function shortVersion(raw: string): string {
  const m = /^(PostgreSQL\s+\S+)/.exec(raw);
  return m ? m[1] : raw.slice(0, 40) || "unknown";
}

/**
 * Prisma's migration table. Null when it does not exist - which is itself the answer: the schema
 * was never migrated, it was pushed or made by hand.
 */
async function readMigrations(): Promise<MigrationState | null> {
  try {
    const rows = await getDb().$queryRaw<MigrationRow[]>`
      SELECT migration_name, finished_at,
             (SELECT count(*) FROM "_prisma_migrations" WHERE finished_at IS NOT NULL) AS applied
      FROM "_prisma_migrations"
      ORDER BY started_at DESC
    `;
    if (rows.length === 0) return { applied: 0, latest: null, appliedAt: null, failed: [] };

    const done = rows.filter((r) => r.finished_at);
    return {
      applied: Number(rows[0].applied),
      latest: done[0]?.migration_name ?? null,
      appliedAt: done[0]?.finished_at?.toISOString() ?? null,
      failed: rows.filter((r) => !r.finished_at).map((r) => r.migration_name),
    };
  } catch {
    // No such table, or no permission to read it. Not worth failing the page over.
    return null;
  }
}
