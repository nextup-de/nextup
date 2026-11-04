// Loads the api part of a written pack into a running app. From apps/app:
//
//     NEXTUP_KNOWLEDGE_TOKEN=... npx tsx prisma/generators/musterwerk-docs/run-load.ts --base http://localhost:3000 --slug acme --pack ../../../ait-pack
//
// The token comes from the environment only; it is never an argument and never printed.
import { readFileSync } from "node:fs";
import { join, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { loadPack } from "./load";
import type { PackFile } from "./manifest";

export function parseArgs(argv: string[]): { base: string; slug: string; pack: string } {
  const get = (k: string) => {
    const i = argv.indexOf(`--${k}`);
    return i >= 0 ? argv[i + 1] : undefined;
  };
  const base = get("base");
  const slug = get("slug");
  const pack = get("pack");
  if (!base || !slug || !pack) throw new Error("usage: run-load.ts --base <url> --slug <slug> --pack <dir>");
  return { base, slug, pack: resolve(pack) };
}

/** Reads manifest.json and the api files of a pack written by run-pack. */
export function readPack(dir: string): PackFile[] {
  const manifest = JSON.parse(readFileSync(join(dir, "manifest.json"), "utf8")) as Omit<PackFile, "body">[];
  return manifest
    .filter((m) => m.channel === "api")
    .map((m) => ({ ...m, body: readFileSync(join(dir, m.path), "utf8") }));
}

/** Returns the exit code. */
export async function main(
  argv: string[],
  env: Record<string, string | undefined>,
  log: (line: string) => void = console.log,
  fetchImpl?: typeof fetch,
): Promise<number> {
  const token = env.NEXTUP_KNOWLEDGE_TOKEN;
  if (!token) {
    log("NEXTUP_KNOWLEDGE_TOKEN is not set.");
    return 2;
  }
  const { base, slug, pack } = parseArgs(argv);
  const r = await loadPack({ base, slug, files: readPack(pack), token, fetch: fetchImpl });
  log(`batches: ${r.batches}, written: ${r.written}, failed: ${r.failed}`);
  if (r.statuses.length) log(`failed statuses: ${r.statuses.join(", ")}`);
  return r.failed > 0 ? 1 : 0;
}

if (process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  main(process.argv.slice(2), process.env).then(
    (code) => process.exit(code),
    (e: unknown) => {
      console.error(e instanceof Error ? e.message : "load failed");
      process.exit(1);
    },
  );
}
