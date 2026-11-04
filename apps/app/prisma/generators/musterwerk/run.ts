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
import { getDb } from "../../../src/lib/db/client";
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

async function main() {
  const a = args(process.argv.slice(2));
  const slug = a.get("slug");
  if (!slug) throw new Error("--slug is required");
  const num = (key: string, fallback: number) => (a.has(key) ? Number(a.get(key)) : fallback);
  const seedArg = a.get("seed") ?? "1";
  const t0 = performance.now();
  const { companyId, counts } = await generateMusterwerk(getDb(), {
    slug,
    people: num("people", 150),
    weeks: num("weeks", 2),
    seed: /^\d+$/.test(seedArg) ? Number(seedArg) : seedArg,
    now: a.has("now") ? new Date(a.get("now")!) : new Date(),
    codesFile: a.get("codes"),
    replace: a.get("replace") === "true",
  });
  console.log(`${slug} (${companyId}): ${JSON.stringify(counts)} in ${((performance.now() - t0) / 1000).toFixed(1)} s`);
  if (a.get("codes")) console.log(`login codes written to ${a.get("codes")}`);
}

main()
  .catch((err) => {
    console.error(err);
    process.exitCode = 1;
  })
  .finally(() => getDb().$disconnect());
