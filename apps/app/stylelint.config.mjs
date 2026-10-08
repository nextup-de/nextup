// Stylelint: keeps every page on the one fixed type scale (src/styles/tokens.css, docs/RESPONSIVE.md).
// Runs in `npm run lint` (and so in CI). Only sizing rules on purpose - no style-guide opinions.
/** @type {import("stylelint").Config} */
const config = {
  plugins: ["stylelint-declaration-strict-value"],
  ignoreFiles: ["src/styles/tokens.css"],
  rules: {
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
