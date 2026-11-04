// The colour rules: blue lives in tokens.css, nothing is filled black, and text stays readable. Each page-group PR
// removes its files from scripts/design/allowlist.json; the list only shrinks, and it ends empty.
import { existsSync, readdirSync, readFileSync, statSync } from "node:fs";
import path from "node:path";
import { describe, expect, it } from "vitest";
// The rules are shared with stylelint.config.mjs and typed by color-rules.d.mts.
import { blackFillDeclaration, blueLiteral } from "../../../scripts/design/color-rules.mjs";

const root = path.resolve(__dirname, "../../..");
const allowlist: { css: string[]; tsx: string[] } = JSON.parse(readFileSync(path.join(root, "scripts/design/allowlist.json"), "utf8"));

const walk = (dir: string): string[] => readdirSync(dir).flatMap((name) => {
  const full = path.join(dir, name);
  return statSync(full).isDirectory() ? walk(full) : [full];
});
const rel = (file: string) => path.relative(root, file).replaceAll("\\", "/");
const breaksRule = (file: string) => {
  const text = readFileSync(path.join(root, file), "utf8");
  return text.search(blueLiteral) >= 0 || text.search(blackFillDeclaration) >= 0;
};

const tokens = readFileSync(path.join(root, "src/styles/tokens.css"), "utf8");
const token = (name: string): string => {
  const m = tokens.match(new RegExp(`${name}:\\s*(#[0-9a-fA-F]{6})\\b`));
  if (!m) throw new Error(`${name} is not a six-digit hex value in tokens.css`);
  return m[1];
};
const luminance = (hex: string) => {
  const [r, g, b] = [1, 3, 5].map((i) => parseInt(hex.substr(i, 2), 16) / 255).map((v) => (v <= 0.03928 ? v / 12.92 : ((v + 0.055) / 1.055) ** 2.4));
  return 0.2126 * r + 0.7152 * g + 0.0722 * b;
};
const contrast = (a: string, b: string) => {
  const [hi, lo] = [luminance(a), luminance(b)].sort((x, y) => y - x);
  return (hi + 0.05) / (lo + 0.05);
};

describe("colour rules", () => {
  it("no source file outside the allowlist hardcodes a blue or a black fill in TSX or TS", () => {
    const files = walk(path.join(root, "src")).filter((f) => /\.tsx?$/.test(f)).map(rel);
    expect(files.filter((f) => breaksRule(f) && !allowlist.tsx.includes(f))).toEqual([]);
  });

  it("the allowlist only names files that still break a rule, so it can only shrink", () => {
    const stale = [...allowlist.css, ...allowlist.tsx].filter((f) => !existsSync(path.join(root, f)) || !breaksRule(f));
    expect(stale).toEqual([]);
  });

  it.each([
    ["white on the button", "--nh-on-brand", "--nh-brand"],
    ["white on hover", "--nh-on-brand", "--nh-brand-hover"],
    ["white on pressed", "--nh-on-brand", "--nh-brand-active"],
    ["white on a toast", "--nh-on-brand", "--nh-brand-deep"],
    ["blue text on white", "--nh-brand-ink", "--nh-card"],
    ["blue text on a tint", "--nh-brand-ink", "--nh-brand-tint"],
    ["body text on white", "--nh-ink", "--nh-card"],
    ["secondary text on white", "--nh-ink-2", "--nh-card"],
    ["meta text on white", "--nh-mute", "--nh-card"],
    ["done on its tint", "--nh-ok", "--nh-ok-tint"],
    ["warning on its tint", "--nh-warn", "--nh-warn-tint"],
    ["danger on its tint", "--nh-danger", "--nh-danger-tint"],
  ])("%s reaches 4.5:1", (_name, text, surface) => {
    expect(contrast(token(text), token(surface))).toBeGreaterThanOrEqual(4.5);
  });

  it("the blue is defined in tokens.css and nowhere else in the tokens", () => {
    const blue = token("--nh-brand");
    expect(tokens.toLowerCase().split(blue.toLowerCase()).length - 1).toBe(1);
  });
});
