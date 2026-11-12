// Creates a real (non-demo) stack's company row on its first start.
//
//     COMPANY_SLUG=test1 COMPANY_NAME="Test Company" [ENTRA_TENANT_ID=<guid>] DATABASE_URL=... npx tsx prisma/bootstrap-company.ts
//
// A demo stack gets its company from prisma/seed.ts. A real stack (stack/install.sh --stage real)
// is not seeded, so without this its database has no company and every page, /login included,
// is a 404. This adds only the company itself, closed and without people, and copies in the Entra
// tenant ID that install.sh --entra-tenant-id wrote, once. The rules: src/lib/db/bootstrap-company.ts.
//
// Idempotent and hands-off: an existing company is never touched (but for that one tenant copy), so a
// restart or a new image cannot undo what the company's admin changed.
import { bootstrapCompany } from "../src/lib/db/bootstrap-company";
import { getDb } from "../src/lib/db/client";

// Same rule as prisma7.config.ts: .env.local on a laptop, the environment everywhere else.
try {
  process.loadEnvFile(".env.local");
} catch {
  /* no .env.local - DATABASE_URL is already in the environment (Docker, CI) */
}

const TENANT = {
  set: "Entra tenant ID copied in (audit: install)",
  kept: "Entra tenant left as the console has it",
  none: "no Entra tenant ID given - set it in /admin -> Access, or rerun install.sh --entra-tenant-id",
  invalid: "ENTRA_TENANT_ID is not a tenant ID (a GUID) - ignored",
} as const;

async function main() {
  const r = await bootstrapCompany();
  if (!r) {
    console.log("bootstrap-company: no COMPANY_SLUG, nothing to do");
    return;
  }
  const what = r.created ? `created "${r.slug}", stage sandbox, closed, no people` : `"${r.slug}" already exists, left as it is`;
  (r.tenant === "invalid" ? console.warn : console.log)(`bootstrap-company: ${what}; ${TENANT[r.tenant]}`);
}

main()
  .catch((err) => {
    console.error(err);
    process.exitCode = 1;
  })
  .finally(() => getDb().$disconnect());
