// Gives the stored events of every real (non-demo) company working-day numbers (CLK-B1): each event's
// `day` becomes the working-day number of its timestamp. Demo companies are not touched.
//
//     npx tsx prisma/clock-backfill.ts      (in apps/app; reads .env.local like prisma/seed.ts)
//
// Run once per stack after the CLK release, after stack/backup.sh. Safe to repeat: a second run
// writes nothing and prints "left as it is".
import { backfillClock } from "../src/lib/db/clock-backfill";
import { getDb } from "../src/lib/db/client";

// Same rule as prisma7.config.ts: .env.local on a laptop, the environment everywhere else.
try {
  process.loadEnvFile(".env.local");
} catch {
  /* no .env.local - DATABASE_URL is already in the environment (Docker, CI) */
}

async function main() {
  for (const { line } of await backfillClock()) console.log(line);
}

main()
  .catch((err) => {
    console.error(err);
    process.exitCode = 1;
  })
  .finally(() => getDb().$disconnect());
