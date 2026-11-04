// Moves hardcoded colours onto tokens, for one area at a time.
//
//   node scripts/design/migrate-colors.mjs src/components/ideas          apply the safe swaps, then list what is left
//   node scripts/design/migrate-colors.mjs src/components/ideas --dry    only report
//   node scripts/design/migrate-colors.mjs --allowlist                   write allowlist.json from the whole app
//
// Exact literals with one right answer are swapped. Black fills are only listed, because a dot, a chart swatch and a
// button each need their own answer: a button takes --nh-brand, a selected state --nh-brand, a toast --nh-brand-deep.
import { readdirSync, readFileSync, statSync, writeFileSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { blackFillDeclaration, blueLiteral, LITERAL_TO_TOKEN } from "./color-rules.mjs";

const here = path.dirname(fileURLToPath(import.meta.url));
const appRoot = path.resolve(here, "../..");
const args = process.argv.slice(2);
const dry = args.includes("--dry");
const targets = args.filter((a) => !a.startsWith("--"));

const walk = (dir) => readdirSync(dir).flatMap((name) => {
  const full = path.join(dir, name);
  return statSync(full).isDirectory() ? walk(full) : [full];
});
const isSource = (f) => /\.(css|tsx?)$/.test(f) && !/styles[\\/]tokens\.css$/.test(f);
const rel = (f) => path.relative(appRoot, f).replaceAll("\\", "/");
const lineOf = (text, index) => text.slice(0, index).split("\n").length;

/** `#abc` must not match inside a longer hex value; a literal in a comment is harmless either way. */
const swap = (text) => {
  let count = 0;
  let out = text;
  for (const [literal, token] of LITERAL_TO_TOKEN) {
    out = out.replace(new RegExp(`${literal}(?![0-9a-fA-F])`, "gi"), () => { count += 1; return token; });
  }
  // A blue with an alpha: rgb(0 122 255 / 12%) keeps its alpha on the token.
  out = out.replace(/rgba?\(\s*(?:0[ ,]+122[ ,]+255|11[ ,]+112[ ,]+209|37[ ,]+99[ ,]+235)\s*[/,]\s*([\d.]+%?)\s*\)/g, (_m, alpha) => {
    count += 1;
    const pct = alpha.endsWith("%") ? alpha : `${Math.round(Number(alpha) * 100)}%`;
    return `color-mix(in srgb, var(--nh-brand) ${pct}, transparent)`;
  });
  return { out, count };
};

if (args.includes("--allowlist")) {
  const files = walk(path.join(appRoot, "src")).filter(isSource);
  const listed = (suffix) => files
    .filter((f) => f.endsWith(suffix))
    .filter((f) => { const t = readFileSync(f, "utf8"); return t.search(blueLiteral) >= 0 || t.search(blackFillDeclaration) >= 0; })
    .map(rel)
    .sort();
  const list = { css: listed(".css"), tsx: [...listed(".tsx"), ...listed(".ts")].sort() };
  writeFileSync(path.join(here, "allowlist.json"), `${JSON.stringify(list, null, 2)}\n`);
  console.log(`allowlist: ${list.css.length} css, ${list.tsx.length} tsx and ts`);
  process.exit(0);
}

if (targets.length === 0) {
  console.error("Name a folder or file under apps/app, for example: src/components/ideas");
  process.exit(1);
}

let swapped = 0;
const left = [];
for (const target of targets) {
  const full = path.resolve(appRoot, target);
  const files = statSync(full).isDirectory() ? walk(full).filter(isSource) : [full];
  for (const file of files) {
    const before = readFileSync(file, "utf8");
    const { out, count } = swap(before);
    swapped += count;
    if (count && !dry) writeFileSync(file, out);
    const text = dry ? before : out;
    for (const m of text.matchAll(blackFillDeclaration)) left.push(`${rel(file)}:${lineOf(text, m.index)}  black fill  ${m[0].slice(0, 70)}`);
    for (const m of text.matchAll(blueLiteral)) left.push(`${rel(file)}:${lineOf(text, m.index)}  blue literal  ${m[0]}`);
  }
}
console.log(`${dry ? "would swap" : "swapped"} ${swapped} literals`);
console.log(left.length ? `${left.length} left for a person to decide:\n${left.join("\n")}` : "nothing left to decide");
