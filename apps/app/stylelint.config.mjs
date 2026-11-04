// Stylelint: keeps every page on the one fixed type scale (src/styles/tokens.css, docs/RESPONSIVE.md), and keeps
// colour on tokens: no black fills, and a blue only ever through a token, so tokens.css can change it in one place.
// Files still on scripts/design/allowlist.json are let through until their page group is moved. Runs in `npm run lint`.
import { readFileSync } from "node:fs";
import { BLACK_FILL_PATTERNS, BLUE_PATTERNS } from "./scripts/design/color-rules.mjs";

const allowlist = JSON.parse(readFileSync(new URL("./scripts/design/allowlist.json", import.meta.url), "utf8"));
const colourRule = [{ "/^background/": [...BLACK_FILL_PATTERNS, ...BLUE_PATTERNS], "/.*/": BLUE_PATTERNS }, { message: "Use a token from src/styles/tokens.css: no black fills and no hardcoded blue." }];
/** @type {import("stylelint").Config} */
const config = {
  plugins: ["stylelint-declaration-strict-value"],
  ignoreFiles: ["src/styles/tokens.css"],
  overrides: allowlist.css.length ? [{ files: allowlist.css, rules: { "declaration-property-value-disallowed-list": null } }] : [],
  rules: {
    "declaration-property-value-disallowed-list": colourRule,
    "scale-unlimited/declaration-strict-value": [
      ["font-size"],
      {
        ignoreVariables: false,
        ignoreFunctions: false,
        ignoreValues: [
          "/^var\\(--nh-fs-[a-z0-9]+\\)$/",           // a step of the scale: var(--nh-fs-sm)
          "/^\\d*\\.?\\d+em$/",                          // relative to the parent's size: 0.9em
          "inherit",
        ],
        message: "Use a step of the type scale for \"${property}\": var(--nh-fs-xs | sm | md | lg | xl | 2xl | 3xl | 4xl), or var(--nh-fs-input) for text fields on phones. Not \"${value}\" (docs/RESPONSIVE.md).",
      },
    ],
  },
};

export default config;
