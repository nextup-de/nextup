// Shared by the design-rule tests (docs/DESIGN_RULES.md): walking the source, flattening a catalog, and the allow-list rule.
// Existing violations sit in an allow-list with one reason per entry. A check fails for a violation that is not listed, and
// for a listed entry that no longer violates, so a list can only shrink.
import { readdirSync, readFileSync, statSync } from "node:fs";
import path from "node:path";

export const ROOT = path.resolve(__dirname, "../../..");

export const read = (file: string): string => readFileSync(path.join(ROOT, file), "utf8");

export const walk = (dir: string): string[] => readdirSync(path.join(ROOT, dir)).flatMap((name) => {
  const rel = `${dir}/${name}`;
  return statSync(path.join(ROOT, rel)).isDirectory() ? walk(rel) : [rel];
});

/** Every file under `dir` with one of these extensions, relative to apps/app, sorted. */
export const filesUnder = (dir: string, ...ext: string[]): string[] => walk(dir).filter((f) => ext.some((e) => f.endsWith(e))).sort();

/** Every string of a catalog (namespaces of keys), by `namespace.key`. */
export function flatten(catalog: Record<string, Record<string, unknown>>): Record<string, string> {
  const out: Record<string, string> = {};
  for (const [ns, keys] of Object.entries(catalog)) for (const [key, value] of Object.entries(keys)) if (typeof value === "string") out[`${ns}.${key}`] = value;
  return out;
}

/** The violations that are not allow-listed, and the allow-listed entries that no longer violate. Both must be empty. */
export function againstAllowList(found: readonly string[], allow: Record<string, string>): { fresh: string[]; fixed: string[] } {
  const seen = new Set(found);
  return { fresh: [...seen].filter((v) => !(v in allow)).sort(), fixed: Object.keys(allow).filter((k) => !seen.has(k)).sort() };
}

/** The innermost rules of a stylesheet as selector and declarations (comments dropped; an @media wrapper is not a rule of its own). */
export function cssRules(css: string): { selector: string; body: string }[] {
  const text = css.replace(/\/\*[\s\S]*?\*\//g, "");
  return [...text.matchAll(/([^{}]+)\{([^{}]*)\}/g)].map((m) => ({ selector: m[1].trim(), body: m[2] }));
}

/** The text of a top-level function of a source file, from `function name` to the next closing brace at column 0. */
export function functionBody(source: string, name: string): string {
  const start = source.search(new RegExp(`function ${name}\\b`));
  if (start < 0) throw new Error(`no function ${name}`);
  const end = source.indexOf("\n}\n", start);
  return source.slice(start, end < 0 ? undefined : end + 3);
}
