// Binds companies stored before IDN to user and seat ids (IDN-M1): seats to users, the stored seed,
// and the actorUserId and payload ids of every event. Labels are never changed.
//
//     npx tsx prisma/identity-backfill.ts      (in apps/app; reads .env.local like prisma/seed.ts)
//
// Run once per stack after the IDN release, after stack/backup.sh. Safe to repeat: a second run
// writes nothing and prints "left as it is".
import { backfillIdentity } from "../src/lib/db/identity-backfill";
import { getDb } from "../src/lib/db/client";

// Same rule as prisma7.config.ts: .env.local on a laptop, the environment everywhere else.
try {
  process.loadEnvFile(".env.local");
} catch {
  /* no .env.local - DATABASE_URL is already in the environment (Docker, CI) */
}

async function main() {
  for (const { line } of await backfillIdentity()) console.log(line);
}

main()
  .catch((err) => {
    console.error(err);
    process.exitCode = 1;
  })
  .finally(() => getDb().$disconnect());
