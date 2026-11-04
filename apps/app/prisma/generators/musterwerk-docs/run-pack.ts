// Writes the AIT document pack. From apps/app:
//
//     npx tsx prisma/generators/musterwerk-docs/run-pack.ts --seed 1 --out ../../../ait-pack
//
// --out must lie outside the repository: the pack is generated, never committed.
import { fileURLToPath } from "node:url";
import { isAbsolute, relative, resolve } from "node:path";
import { musterwerkDocs } from "./pack";
import { writePack } from "./write";

const REPO_ROOT = resolve(fileURLToPath(import.meta.url), "../../../../../..");

export function isInsideRepo(out: string, root = REPO_ROOT): boolean {
  const rel = relative(root, resolve(out));
  return rel === "" || (!rel.startsWith("..") && !isAbsolute(rel));
}

export function parseArgs(argv: string[]): { seed: number; out: string } {
  const get = (k: string) => {
    const i = argv.indexOf(`--${k}`);
    return i >= 0 ? argv[i + 1] : undefined;
  };
  const seed = Number(get("seed") ?? "1");
  const out = get("out");
  if (!Number.isInteger(seed)) throw new Error("--seed must be a whole number");
  if (!out) throw new Error("--out <dir> is required");
  if (isInsideRepo(out)) throw new Error(`--out ${out} is inside the repository; the pack is never committed. Choose a folder outside it.`);
  return { seed, out: resolve(out) };
}

if (process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  const { seed, out } = parseArgs(process.argv.slice(2));
  const files = musterwerkDocs(seed);
  writePack(files, out);
  console.log(`${files.length} files written to ${out}`);
}
