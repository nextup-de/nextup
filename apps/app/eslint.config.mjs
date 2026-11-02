import { defineConfig, globalIgnores } from "eslint/config";
import nextVitals from "eslint-config-next/core-web-vitals";
import nextTs from "eslint-config-next/typescript";
import noInlineStrings from "./eslint/no-inline-strings.mjs";

const eslintConfig = defineConfig([
  ...nextVitals,
  ...nextTs,
  // Override default ignores of eslint-config-next.
  globalIgnores([
    // Default ignores of eslint-config-next:
    ".next/**",
    "out/**",
    "build/**",
    "next-env.d.ts",
    // Collaborator drop-zone (gitignored): mockups, Figma exports, screenshots.
    "uploads/**",
  ]),
  // Plan LNG, D9: user-facing text goes through the message catalog (src/i18n). Operator console, API JSON,
  // developer tools, preview data and the catalog itself are out of scope.
  {
    files: [
      "src/components/**/*.{ts,tsx}",
      "src/app/**/*.{ts,tsx}",
      "src/features/cases/{notice,permissions,rows,discussion}.ts",
      "src/features/loop/notice.ts",
      "src/features/ideas/{raise,receivers,replies,finalize,benchmarks,company-read}.ts",
      "src/features/projects/{permissions,views}.ts",
      "src/server/{case-notice,loop-notice}.ts",
      "src/server/actions/events.ts",
    ],
    ignores: [
      "src/components/admin/**",
      "src/app/admin/**",
      "src/app/api/**",
      "src/components/shell/{DevPanel,DemoControls}.tsx",
      "**/*Preview.ts",
      "src/i18n/messages/**",
    ],
    plugins: { nextup: noInlineStrings },
    rules: { "nextup/no-inline-strings": "error" },
  },
]);

export default eslintConfig;
