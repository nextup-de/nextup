// The Musterwerk generator's command line (TST-G1, D5). From apps/app:
//
//     npx tsx prisma/generators/musterwerk/run.ts --slug mw --people 150 --weeks 2 --seed 1
//
//   --slug <slug>     company slug (required)
//   --people <n>      number of people, at least 40 (default 150)
//   --weeks <w>       weeks of case history (default 2)
//   --seed <s>        number or text; the same seed gives the same rows (default 1)
//   --now <iso>       the moment "now" is (default: the real time)
//   --codes <file>    write "<email> TAB <login code>" per person; without it the codes are not kept
//   --replace         delete a company with this slug first (otherwise an existing slug is refused)
//   --replace-generated  the same, but only for an empty sandbox company or a Musterwerk of an earlier run
//   --email-domain <domain>  what stands after the @ of every address (default musterwerk.test); the
//                     same seed gives the same people under any domain
//   --export-people <file>  write the people as JSON (name, email, department = unit key, jobTitle,
//                     managerEmail, enabled) for ops/tst/entra-users.ts
//   --export-only     with --export-people: write the file and stop. No database is read or written
//   --ai-on           switch AI routing and the assistant on for the company (default: both off)
import { getDb } from "../../../src/lib/db/client";
import { DEFAULT_EMAIL_DOMAIN, musterwerkCrew, writePeopleExport } from "./export";
import { generateMusterwerk } from "./index";

// Same rule as prisma/seed.ts: .env.local on a laptop, the environment everywhere else.
try {
  process.loadEnvFile(".env.local");
} catch {
  /* no .env.local - DATABASE_URL is already in the environment (Docker, CI) */
}

function args(argv: string[]): Map<string, string> {
  const out = new Map<string, string>();
  for (let i = 0; i < argv.length; i++) {
    if (!argv[i].startsWith("--")) throw new Error(`unexpected argument ${argv[i]}`);
    const key = argv[i].slice(2);
    const next = argv[i + 1];
    if (next === undefined || next.startsWith("--")) out.set(key, "true");
    else {
      out.set(key, next);
      i++;
    }
  }
  return out;
}

let usedDb = false;

async function main() {
  const a = args(process.argv.slice(2));
  const slug = a.get("slug");
  if (!slug) throw new Error("--slug is required");
  const num = (key: string, fallback: number) => (a.has(key) ? Number(a.get(key)) : fallback);
  const seedArg = a.get("seed") ?? "1";
  const seed = /^\d+$/.test(seedArg) ? Number(seedArg) : seedArg;
  const emailDomain = a.get("email-domain") ?? DEFAULT_EMAIL_DOMAIN;
  const exportFile = a.get("export-people");
  if (exportFile === "true") throw new Error("--export-people needs a file name");

  if (a.get("export-only") === "true") {
    if (!exportFile) throw new Error("--export-only needs --export-people <file>");
    const { people } = musterwerkCrew({ slug, people: num("people", 150), seed, emailDomain });
    writePeopleExport(exportFile, people.users, emailDomain);
    console.log(`${people.users.length} people written to ${exportFile} (no database touched)`);
    return;
  }

  const t0 = performance.now();
  usedDb = true;
  const { companyId, counts } = await generateMusterwerk(getDb(), {
    slug,
    people: num("people", 150),
    weeks: num("weeks", 2),
    seed,
    now: a.has("now") ? new Date(a.get("now")!) : new Date(),
    codesFile: a.get("codes"),
    replace: a.get("replace") === "true",
    replaceGenerated: a.get("replace-generated") === "true",
    emailDomain,
    exportFile,
    aiOn: a.get("ai-on") === "true",
  });
  console.log(`${slug} (${companyId}): ${JSON.stringify(counts)} in ${((performance.now() - t0) / 1000).toFixed(1)} s`);
  if (a.get("codes")) console.log(`login codes written to ${a.get("codes")}`);
  if (exportFile) console.log(`people written to ${exportFile}`);
}

main()
  .catch((err) => {
    console.error(err);
    process.exitCode = 1;
  })
  .finally(() => (usedDb ? getDb().$disconnect() : undefined));
