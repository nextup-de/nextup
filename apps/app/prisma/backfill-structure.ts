// Writes the structure of companies stored before the tables existed (STR, D11).
//
//     npx tsx prisma/backfill-structure.ts      (reads .env.local like prisma/seed.ts)
//
// For every company with no org unit whose stored seed has departments, the units, roles, holders
// and routes become rows. No rules, no goals. Idempotent: a second run writes nothing.
import { backfillStructure } from "../src/lib/db/structure-writes";
import { getDb } from "../src/lib/db/client";

// Same rule as prisma7.config.ts: .env.local on a laptop, the environment everywhere else.
try {
  process.loadEnvFile(".env.local");
} catch {
  /* no .env.local - DATABASE_URL is already in the environment (Docker, CI) */
}

async function main() {
  for (const { line } of await backfillStructure()) console.log(line);
}

main()
  .catch((err) => {
    console.error(err);
    process.exitCode = 1;
  })
  .finally(() => getDb().$disconnect());
