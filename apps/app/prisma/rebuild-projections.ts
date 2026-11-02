// Rebuilds the CaseView rows of every company (VIS-B1, D6): after a release that changes the rule, an
// org change, or to give old custom raises their audience by id (D10).
//
//     npx tsx prisma/rebuild-projections.ts      (in apps/app; reads .env.local like prisma/seed.ts)
//
// One line per company: `<slug>: <n> cases`. Safe to repeat.
import { getDb } from "../src/lib/db/client";
import { rebuildProjections } from "../src/lib/db/projections/case-view";

// Same rule as prisma7.config.ts: .env.local on a laptop, the environment everywhere else.
try {
  process.loadEnvFile(".env.local");
} catch {
  /* no .env.local - DATABASE_URL is already in the environment (Docker, CI) */
}

async function main() {
  const companies = await getDb().company.findMany({ select: { id: true, slug: true }, orderBy: { slug: "asc" } });
  for (const c of companies) console.log(`${c.slug}: ${await rebuildProjections(c.id)} cases`);
}

main()
  .catch((err) => {
    console.error(err);
    process.exitCode = 1;
  })
  .finally(() => getDb().$disconnect());
