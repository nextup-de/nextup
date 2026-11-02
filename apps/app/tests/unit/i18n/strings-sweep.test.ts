import path from "node:path";
import { ESLint } from "eslint";
import { describe, expect, it } from "vitest";
import { catalogIssues, inlineStrings } from "./inline";

const APP_ROOT = path.resolve(__dirname, "../../..");
const OWNED = [
  "src/features/evaluate/**/*.{ts,tsx}",
  "src/features/knowledge/**/*.{ts,tsx}",
  "src/features/m365/**/*.{ts,tsx}",
  "src/server/jira/**/*.{ts,tsx}",
  "src/server/jira-sync.ts",
  "src/server/m365-*.ts",
  "src/server/connectors/**/*.{ts,tsx}",
];
// One file of each owned folder or file pattern.
const SAMPLES = [
  "src/features/evaluate/index.ts",
  "src/features/knowledge/index.ts",
  "src/features/m365/search.ts",
  "src/server/jira/round.ts",
  "src/server/jira-sync.ts",
  "src/server/m365-profile.ts",
  "src/server/connectors/jira.ts",
];

describe("LNG strings sweep", () => {
  it("has no inline user-facing string in the structure and connector folders", async () => {
    expect(await inlineStrings(OWNED)).toEqual([]);
  }, 60_000);
  it("has complete structure and connectors namespaces", () => {
    expect(catalogIssues("structure")).toEqual([]);
    expect(catalogIssues("connectors")).toEqual([]);
  });
  it("switches the lint rule on for every owned folder", async () => {
    const eslint = new ESLint({ cwd: APP_ROOT });
    for (const file of SAMPLES) {
      const resolved = await eslint.calculateConfigForFile(path.join(APP_ROOT, file));
      const rule = resolved?.rules?.["nextup/no-inline-strings"];
      expect([file, Array.isArray(rule) ? rule[0] : rule]).toEqual([file, 2]);
    }
  }, 60_000);
});
