// Guards the one spacing and type scale (docs/DESIGN_SCALE.md, src/styles/tokens.css). Stylelint
// (nextup/spacing-scale) checks padding, margin and gap in CSS; this test checks the scale itself, the
// inline styles in components that Stylelint never sees, and that every step a file names exists.
import { readdirSync, readFileSync, statSync } from "node:fs";
import { join, relative } from "node:path";
import { describe, expect, it } from "vitest";
import { nearestSpace, readScale } from "../../../scripts/design/scale.mjs";

const ROOT = join(__dirname, "..", "..", "..");
const SRC = join(ROOT, "src");
const scale = readScale(); // the same module Stylelint and the Paper check read

function files(dir: string, exts: string[]): string[] {
  return readdirSync(dir).flatMap((name) => {
    const path = join(dir, name);
    if (statSync(path).isDirectory()) return files(path, exts);
    return exts.some((e) => name.endsWith(e)) ? [path] : [];
  });
}
const rel = (path: string) => relative(ROOT, path).split("\\").join("/");

describe("one spacing and type scale", () => {
  it("the spacing steps are whole px, rising, each named by its size", () => {
    expect(scale.spacing.length).toBeGreaterThanOrEqual(10);
    for (let i = 1; i < scale.spacing.length; i++) expect(scale.spacing[i]).toBeGreaterThan(scale.spacing[i - 1]);
    for (const s of scale.spacing) expect(s % 2, `--nh-sp-${s}: even px only`).toBe(0);
  });

  it("a value between steps goes to the nearest step, ties up", () => {
    expect(nearestSpace(12, scale.spacing)).toBe(12);
    expect(nearestSpace(13, scale.spacing)).toBe(14);
    expect(nearestSpace(7.5, scale.spacing)).toBe(8);
    expect(nearestSpace(4.5, scale.spacing)).toBe(4);
    expect(nearestSpace(1, scale.spacing)).toBe(1);
    expect(nearestSpace(0.4, scale.spacing)).toBe(0);
  });

  it("every type size has a line height for a line of UI", () => {
    for (const name of Object.keys(scale.fontSizes)) {
      const lh = scale.lineHeights[name];
      expect(lh?.ui, `--nh-lh-${name}`).toBeGreaterThan(scale.fontSizes[name]);
      if (lh?.text) expect(lh.text, `--nh-lh-${name}-text`).toBeGreaterThanOrEqual(lh.ui ?? 0);
    }
  });

  it("every --nh-sp-N a file names is a step of the scale", () => {
    const steps = new Set(scale.spacing);
    const bad = files(SRC, [".css", ".tsx", ".ts"]).filter((f) => !f.endsWith("tokens.css")).flatMap((f) =>
      [...readFileSync(f, "utf8").matchAll(/--nh-sp-(\d+)\b/g)].filter((m) => !steps.has(Number(m[1]))).map((m) => `${rel(f)}  ${m[0]}`));
    expect(bad, "use a step from src/styles/tokens.css").toEqual([]);
  });

  it("inline styles in components use the spacing scale too (no padding: 12, no \"12px\")", () => {
    const prop = /\b(padding|margin|gap|rowGap|columnGap)(Top|Bottom|Left|Right|Inline|Block|InlineStart|InlineEnd|BlockStart|BlockEnd)?\s*:\s*(-?\d|"[^"]*\b(?!1px\b)\d+(\.\d+)?(px|rem)\b)/;
    const bad = files(SRC, [".tsx"]).flatMap((f) => readFileSync(f, "utf8").split(/\r?\n/).map((text, i) => ({ text, at: `${rel(f)}:${i + 1}` })))
      .filter((l) => /style=\{\{/.test(l.text) && prop.test(l.text))
      .map((l) => `${l.at}  ${l.text.trim()}`);
    expect(bad, "use \"var(--nh-sp-N)\" (docs/DESIGN_SCALE.md)").toEqual([]);
  });
});
