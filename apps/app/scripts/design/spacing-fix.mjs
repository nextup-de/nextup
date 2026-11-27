// Puts every padding, margin and gap in the app's CSS on the spacing scale (src/styles/tokens.css):
// 12px -> var(--nh-sp-12); a value between steps goes to the nearest step, ties up (13px -> var(--nh-sp-14)).
// 0 and 1px stay. Values over the top step are left alone and listed: they are layout, not spacing.
//
//   npm run design:spacing-fix                 every CSS file under src/
//   npm run design:spacing-fix -- a.css b.css  only these files
//   ... -- --check                             change nothing, list what would change
import { readFileSync, readdirSync, statSync, writeFileSync } from "node:fs";
import { join, relative } from "node:path";
import postcss from "postcss";
import valueParser from "postcss-value-parser";
import { SPACING_PROP, SPACING_FREE, layoutFrom, nearestSpace, readScale, spaceCss } from "./scale.mjs";

const APP = new URL("../..", import.meta.url).pathname;
const args = process.argv.slice(2);
const check = args.includes("--check");
const only = args.filter((a) => !a.startsWith("--"));

function cssFiles(dir) {
  return readdirSync(dir).flatMap((name) => {
    const path = join(dir, name);
    if (statSync(path).isDirectory()) return cssFiles(path);
    return name.endsWith(".css") && !path.endsWith("styles/tokens.css") ? [path] : [];
  });
}

const { spacing } = readScale();
const top = spacing[spacing.length - 1];
const files = only.length ? only.map((f) => join(process.cwd(), f)) : cssFiles(join(APP, "src"));
const stats = { exact: 0, moved: 0, files: 0 };
const moved = [], left = [];

for (const file of files) {
  const before = readFileSync(file, "utf8");
  const root = postcss.parse(before, { from: file });
  root.walkDecls((decl) => {
    if (!SPACING_PROP.test(decl.prop.toLowerCase())) return;
    const parsed = valueParser(decl.value);
    let changed = false;
    parsed.walk((node) => {
      if (node.type === "function" && node.value === "var") return false;
      if (node.type !== "word") return;
      const m = /^(-?)(\d*\.?\d+)(px|rem)$/.exec(node.value);
      if (!m) return;
      const px = Number(m[2]) * (m[3] === "rem" ? 16 : 1);
      if (m[3] === "px" && SPACING_FREE.has(px)) return;
      const at = `${relative(APP, file)}:${decl.source?.start?.line}`;
      if (px > layoutFrom(spacing)) { left.push(`${at}  ${decl.prop}: ${decl.value}`); return; }
      const step = nearestSpace(px, spacing);
      if (step === px) stats.exact++;
      else { stats.moved++; moved.push(`${at}  ${node.value} -> ${step}px  (${decl.prop})`); }
      node.value = spaceCss(step, m[1] === "-");
      changed = true;
    });
    if (changed) decl.value = parsed.toString();
  });
  const after = root.toString();
  if (after !== before) {
    stats.files++;
    if (!check) writeFileSync(file, after);
  }
}

console.log(`${check ? "would change" : "changed"} ${stats.files} files: ${stats.exact} values already on a step, ${stats.moved} moved to the nearest step`);
if (moved.length) console.log(`\nmoved (${moved.length}):\n` + moved.join("\n"));
if (left.length) console.log(`\nleft alone, over ${top}px - make it a layout size or a step by hand (${left.length}):\n` + left.join("\n"));
