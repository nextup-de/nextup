// The pilot bootstrap's command line (PIL D13). From apps/app:
//
//   npx tsx prisma/generators/pilot/run.ts bootstrap --config <file> [--codes <file>] [--json]
//   npx tsx prisma/generators/pilot/run.ts sample --people <n> --seed <s> --out <dir>
//   npx tsx prisma/generators/pilot/run.ts report --slug <slug> --now <iso>
//
// Exit codes: 0 done (open checks are listed, not an error), 1 refused or failed, 2 the config is refused (nothing
// written), 3 the CSV files have errors (structure unwritten). See README.md.
import { mkdirSync, readFileSync, writeFileSync } from "node:fs";
import path from "node:path";
import { getDb, hasDatabase } from "../../../src/lib/db/client";
import { bootstrapPilot, checkLine } from "./bootstrap";
import { parsePilotConfig } from "./config";
import { reportOnce } from "./report";
import { pilotSample } from "./sample";

try {
  process.loadEnvFile(".env.local");
} catch {
  /* no .env.local - DATABASE_URL is already in the environment */
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

async function main(): Promise<number> {
  const [command, ...rest] = process.argv.slice(2);
  const a = args(rest);
  const json = a.get("json") === "true";
  const say = (data: unknown, text: string) => console.log(json ? JSON.stringify(data, null, 2) : text);

  if (command === "bootstrap") {
    const file = a.get("config");
    if (!file) throw new Error("--config <file> is required");
    const parsed = parsePilotConfig(readFileSync(file, "utf8"));
    if (!parsed.ok) {
      if (json) console.log(JSON.stringify({ status: "config", problems: parsed.problems }, null, 2));
      else for (const p of parsed.problems) console.error(`config: ${p}`);
      return 2;
    }
    const r = await bootstrapPilot({ config: parsed.config, now: new Date(), baseDir: path.dirname(path.resolve(file)), codesFile: a.get("codes") });
    if (json) console.log(JSON.stringify(r, null, 2));
    else {
      for (const s of r.steps) console.log(s);
      for (const e of r.csvErrors) console.log(`csv ${e.file}${e.line ? `:${e.line}` : ""}${e.column ? ` ${e.column}` : ""}: ${e.text}`);
      for (const c of r.checks) console.log(checkLine(c));
      console.log(r.open.length === 0 ? "no needed check is open" : `needed and open: ${r.open.join(", ")}`);
    }
    return r.status === "csv" ? 3 : r.status === "refused" ? 1 : 0;
  }

  if (command === "sample") {
    const dir = a.get("out");
    if (!dir) throw new Error("--out <dir> is required");
    const seedArg = a.get("seed") ?? "1";
    const files = pilotSample({ people: Number(a.get("people") ?? 150), seed: /^\d+$/.test(seedArg) ? Number(seedArg) : seedArg });
    mkdirSync(dir, { recursive: true });
    for (const [kind, text] of Object.entries(files)) writeFileSync(path.join(dir, `${kind}.csv`), text);
    say({ out: dir, files: Object.keys(files).map((k) => `${k}.csv`) }, `wrote units.csv, roles.csv, members.csv, routes.csv to ${dir}`);
    return 0;
  }

  if (command === "report") {
    const slug = a.get("slug");
    if (!slug) throw new Error("--slug is required");
    const n = await reportOnce(slug, a.has("now") ? new Date(a.get("now")!) : new Date());
    say({ slug, rows: n }, `${slug}: ${n} outbox row(s) written`);
    return 0;
  }

  throw new Error("usage: run.ts bootstrap|sample|report (see prisma/generators/pilot/README.md)");
}

main()
  .then((code) => { process.exitCode = code; })
  .catch((err) => {
    console.error(err instanceof Error ? err.message : err);
    process.exitCode = 1;
  })
  .finally(() => (hasDatabase() ? getDb().$disconnect() : undefined));
