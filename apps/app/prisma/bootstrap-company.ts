// Creates a real (non-demo) stack's company row on its first start.
//
//     COMPANY_SLUG=test1 COMPANY_NAME="Test Company" DATABASE_URL=... npx tsx prisma/bootstrap-company.ts
//
// A demo stack gets its company from prisma/seed.ts. A real stack (stack/install.sh --stage real)
// is not seeded, so without this its database has no company and every page, /login included,
// is a 404. This adds only the company itself: the empty template, sandbox stage (real people,
// demo tools off), no people. Its admin adds the people at <origin>/admin -> People.
//
// Idempotent and hands-off: an existing company is never touched, so a restart or a new image
// cannot undo what the company's admin changed.
import { seedTemplate } from "../src/features/demo";
import { toSeedJson } from "../src/features/demo/parse";
import { markFor } from "../src/features/tenant/create";
import { getDb } from "../src/lib/db/client";

// Same rule as prisma7.config.ts: .env.local on a laptop, the environment everywhere else.
try {
  process.loadEnvFile(".env.local");
} catch {
  /* no .env.local - DATABASE_URL is already in the environment (Docker, CI) */
}

async function main() {
  const slug = process.env.COMPANY_SLUG?.trim();
  if (!slug) {
    console.log("bootstrap-company: no COMPANY_SLUG, nothing to do");
    return;
  }
  const name = process.env.COMPANY_NAME?.trim() || slug;

  const db = getDb();
  if (await db.company.findUnique({ where: { slug }, select: { id: true } })) {
    console.log(`bootstrap-company: "${slug}" already exists, left as it is`);
    return;
  }
  await db.company.create({
    data: {
      slug,
      name,
      mark: markFor({ name }),
      stage: "sandbox",
      seedJson: toSeedJson(seedTemplate("empty")) as object,
      config: { create: {} },
    },
  });
  console.log(`bootstrap-company: created "${slug}" (${name}), stage sandbox - add people at /admin`);
}

main()
  .catch((err) => {
    console.error(err);
    process.exitCode = 1;
  })
  .finally(() => getDb().$disconnect());
