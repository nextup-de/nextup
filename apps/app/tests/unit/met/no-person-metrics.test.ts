// MET-Z1: a source scan of src. The product shows no person ranking or person metric (MET D2, D15): the preview
// modules and the contributor ranking are gone, the person route is keyed by user id, no link is built from a name.
import { existsSync, readdirSync, readFileSync, statSync } from "node:fs";
import { join, relative, sep } from "node:path";
import { describe, expect, it } from "vitest";

const SRC = join(__dirname, "..", "..", "..", "src");

function walk(dir: string, out: string[] = []): string[] {
  for (const name of readdirSync(dir)) {
    const p = join(dir, name);
    if (statSync(p).isDirectory()) walk(p, out);
    else out.push(p);
  }
  return out;
}
const files = walk(SRC);
const rel = (p: string) => relative(SRC, p).split(sep).join("/");
const code = files.filter((f) => /\.(ts|tsx)$/.test(f));
const cache = new Map<string, string>();
const read = (f: string) => {
  let text = cache.get(f);
  if (text === undefined) cache.set(f, (text = readFileSync(f, "utf8")));
  return text;
};
// A full run reads a few thousand files while all test files run in parallel; give the scan room.
const SLOW = 60_000;

describe("MET no person metrics", () => {
  it("has no preview module and nothing imports one", () => {
    expect(files.filter((f) => /(dashboardPreview|feedPreview|overviewPreview)\.[tj]sx?$/.test(f)).map(rel)).toEqual([]);
    const importers = code.filter((f) => /(import|from|require)\b[^\n]*(dashboardPreview|feedPreview|overviewPreview)/.test(read(f)));
    expect(importers.map(rel)).toEqual([]);
  }, SLOW);

  it("exports no contributor ranking from features/metrics", () => {
    const metrics = code.filter((f) => rel(f).startsWith("features/metrics/"));
    const bad = /export\s+(async\s+)?(function|const|let|type|interface|class)\s+(contributors|desks|Contributor)\b|export\s*\{[^}]*\b(contributors|desks|Contributor)\b[^}]*\}/;
    expect(metrics.filter((f) => bad.test(read(f))).map(rel)).toEqual([]);
  }, SLOW);

  it("has no person route keyed by name", () => {
    const folders = new Set<string>();
    for (const f of files) {
      const parts = rel(f).split("/");
      for (let i = 0; i < parts.length - 1; i++) if (parts[i] === "people") folders.add(parts[i + 1]);
    }
    expect(folders.has("[name]")).toBe(false);
    expect(existsSync(join(SRC, "app", "[company]", "(app)", "people", "[userId]"))).toBe(true);
  }, SLOW);

  it("builds no /people/ link from a display name in a component", () => {
    const concat = /["'`]\/people\/["'`]\s*\+\s*encodeURIComponent\([^)]*\.name\b/;
    const template = /\/people\/\$\{\s*encodeURIComponent\([^)]*\.name\b/;
    const tsx = code.filter((f) => f.endsWith(".tsx"));
    expect(tsx.filter((f) => concat.test(read(f)) || template.test(read(f))).map(rel)).toEqual([]);
  }, SLOW);

  it("reads tenant.hiddenPeople only in RaisePerson", () => {
    // Q5: RaisePerson still filters the raise page's suggestions by it until LOOP replaces the list; no other reader.
    const readers = code.filter((f) => /\.hiddenPeople\b/.test(read(f))).map(rel);
    expect(readers).toEqual(["components/ideas/RaisePerson.tsx"]);
  }, SLOW);
});
