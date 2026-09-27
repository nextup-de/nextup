// Seeds the demo company into a fresh database.
//
//     npm run db:seed            (reads .env.local like the Prisma CLI does)
//     DATABASE_URL=... npx tsx prisma/seed.ts
//
// Idempotent: re-running updates the company in place and leaves its event rows alone, so it is
// safe against a database people are already clicking around in.
//
// It ports src/features/demo/seed.ts (itself the port of legacy/demo/js/data.js) into acme's
// seedJson, and creates that company's people from the demo table - each with a personal login
// code (printed once). Set SEED_NEW_CODES=true to replace codes people already have.
import { generateLoginCode, hashLoginCode } from "../src/features/auth/login-code";
import { DEMO_COMPANIES } from "../src/features/tenant/demo-companies";
import { seedTemplate } from "../src/features/demo";
import { toSeedJson } from "../src/features/demo/parse";
import { GOALS } from "../src/features/evaluate";
import { rowsFromSeed } from "../src/features/knowledge";
import { getDb } from "../src/lib/db/client";
import { replaceKnowledge } from "../src/lib/db/knowledge";

// Same rule as prisma7.config.ts: .env.local on a laptop, the environment everywhere else.
try {
  process.loadEnvFile(".env.local");
} catch {
  /* no .env.local - DATABASE_URL is already in the environment (Docker, CI) */
}

const iniOf = (name: string) => name.split(" ").map((w) => w[0]).join("").slice(0, 2);

async function main() {
  const db = getDb();
  const demo = DEMO_COMPANIES[0];
  const newCodes = process.env.SEED_NEW_CODES === "true";

  const company = await db.company.upsert({
    where: { slug: demo.slug },
    update: {
      name: demo.name,
      mark: demo.mark,
      anonymousHandles: demo.anonymousHandles,
      seedJson: toSeedJson(seedTemplate("demo")) as object,
    },
    create: {
      slug: demo.slug,
      name: demo.name,
      mark: demo.mark,
      anonymousHandles: demo.anonymousHandles,
      stage: "demo",
      seedJson: toSeedJson(seedTemplate("demo")) as object,
      config: { create: {} },
    },
  });

  // The org units, roles, routing table and goals as rows (docs/COMPANY_KNOWLEDGE.md). Replaced
  // wholesale on every run: nobody edits acme's structure by hand yet.
  await replaceKnowledge(company.id, rowsFromSeed(seedTemplate("demo"), GOALS, () => crypto.randomUUID()), "seed");

  const printed: string[] = [];
  for (const u of demo.users) {
    const user = await db.user.upsert({
      where: { companyId_email: { companyId: company.id, email: u.email } },
      update: { name: u.name, role: u.role, dept: u.dept, handle: u.handle ?? null },
      create: {
        companyId: company.id,
        name: u.name,
        email: u.email,
        role: u.role,
        dept: u.dept,
        ini: iniOf(u.name),
        handle: u.handle ?? null,
      },
    });
    // Only people without a code, unless asked: a re-run must not silently invalidate a code
    // someone is already using to get in.
    if (!user.loginCodeHash || newCodes) {
      const code = generateLoginCode(company.slug);
      await db.user.update({ where: { id: user.id, companyId: company.id }, data: { loginCodeHash: hashLoginCode(code), loginCodeAt: new Date() } });
      printed.push(`  ${u.name.padEnd(14)} ${code}`);
    }
  }

  const created = !(await db.caseEvent.count({ where: { companyId: company.id } }));
  console.log(`seeded ${company.slug} (${demo.users.length} people, event log ${created ? "empty" : "left as it was"})`);
  if (printed.length) {
    console.log("login codes (shown once; only hashes are stored - new ones any time in /admin):");
    for (const line of printed) console.log(line);
  } else {
    console.log("login codes: everyone has one already (SEED_NEW_CODES=true replaces them)");
  }
  await db.$disconnect();
}

main().catch(async (err) => {
  console.error(err);
  process.exit(1);
});
