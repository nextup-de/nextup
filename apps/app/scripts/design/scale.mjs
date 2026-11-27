// The one scale for Paper and the app, read from src/styles/tokens.css so nothing keeps its own copy.
// Used by the spacing lint (stylelint-spacing.mjs), the spacing fixer (spacing-fix.mjs) and the Paper check
// (paper-check.mjs). docs/DESIGN_SCALE.md explains the scale.
import { readFileSync } from "node:fs";

export const TOKENS_URL = new URL("../../src/styles/tokens.css", import.meta.url);

/** Spacing properties the scale covers: padding, margin and gap in all their forms (CSS spelling). */
export const SPACING_PROP = /^(padding|margin)(-(top|right|bottom|left|inline|block)(-(start|end))?)?$|^(row-|column-)?gap$/;

/** Values allowed besides a step: 0, and 1px for hairline nudges next to a border. */
export const SPACING_FREE = new Set([0, 1]);

export function readScale(css = readFileSync(TOKENS_URL, "utf8")) {
  const root = css.split("@media")[0];
  const spacing = [...root.matchAll(/--nh-sp-(\d+):\s*(\d+)px;/g)].map((m) => {
    if (m[1] !== m[2]) throw new Error(`--nh-sp-${m[1]} must be ${m[1]}px, is ${m[2]}px`);
    return Number(m[2]);
  });
  const fontSizes = Object.fromEntries([...root.matchAll(/--nh-fs-([a-z0-9]+):\s*(\d+)px;/g)].map((m) => [m[1], Number(m[2])]));
  /** @type {Record<string, { ui?: number, text?: number }>} */
  const lineHeights = {};
  for (const m of root.matchAll(/--nh-lh-([a-z0-9]+?)(-text)?:\s*(\d+)px;/g)) {
    (lineHeights[m[1]] ??= {})[m[2] ? "text" : "ui"] = Number(m[3]);
  }
  /** Every token with a plain value, for matching a colour or size back to its name. */
  const values = Object.fromEntries([...root.matchAll(/(--(?:nh|radius)-[a-z0-9-]+):\s*([^;]+);/g)]
    .map((m) => [m[1], m[2].replace(/\/\*.*?\*\//g, "").trim()]));
  return { spacing, fontSizes, lineHeights, values };
}

/** Above this a length in a padding/margin/gap is a layout width (a centred column), not a space. */
export const layoutFrom = (spacing) => spacing[spacing.length - 1] * 1.25;

/** The step a raw spacing value belongs on: nearest, ties go up (more room is the calmer mistake). */
export function nearestSpace(px, spacing) {
  const options = [...SPACING_FREE, ...spacing];
  let best = options[0];
  for (const o of options) {
    const d = Math.abs(o - px), bd = Math.abs(best - px);
    if (d < bd || (d === bd && o > best)) best = o;
  }
  return best;
}

/** CSS for a spacing value on the scale: 0, 1px, var(--nh-sp-N), or its negative. */
export function spaceCss(step, negative = false) {
  if (step === 0) return "0";
  const v = step === 1 ? "1px" : `var(--nh-sp-${step})`;
  if (!negative) return v;
  return step === 1 ? "-1px" : `calc(-1 * ${v})`;
}

/** The nearest font-size step for a raw size, as its token name. */
export function nearestFontSize(px, fontSizes) {
  let best = null;
  for (const [name, v] of Object.entries(fontSizes)) {
    if (name === "input") continue;
    if (!best || Math.abs(v - px) < Math.abs(best[1] - px) || (Math.abs(v - px) === Math.abs(best[1] - px) && v > best[1])) best = [name, v];
  }
  return best;
}
