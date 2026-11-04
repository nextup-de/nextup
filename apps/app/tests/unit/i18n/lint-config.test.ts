import path from "node:path";
import { ESLint } from "eslint";
import { describe, expect, it } from "vitest";

const APP_ROOT = path.resolve(__dirname, "../../..");
const RULE = "nextup/no-inline-strings";
const eslint = new ESLint({ cwd: APP_ROOT });

async function severity(file: string): Promise<number> {
  const config = await eslint.calculateConfigForFile(path.join(APP_ROOT, file));
  const entry = config?.rules?.[RULE];
  const level = Array.isArray(entry) ? entry[0] : entry;
  return level === "error" || level === 2 ? 2 : level === "warn" || level === 1 ? 1 : 0;
}

describe("LNG lint rule registered", () => {
  it.each([
    "src/app/[company]/(app)/page.tsx",
    "src/features/cases/rows.ts",
  ])("is an error for %s", async (file) => {
    expect(await severity(file)).toBe(2);
  }, 60_000);

  it.each([
    "src/components/admin/AdminNav.tsx",
    "src/app/api/health/route.ts",
    "src/components/shell/DevPanel.tsx",
    "src/i18n/messages/common.ts",
  ])("is off for %s", async (file) => {
    expect(await severity(file)).toBe(0);
  }, 60_000);

  it("reports nothing over the whole scope", async () => {
    const results = await eslint.lintFiles([
      "src/components/**/*.{ts,tsx}",
      "src/app/**/*.{ts,tsx}",
      "src/features/cases/{notice,permissions,rows,discussion}.ts",
      "src/features/loop/notice.ts",
      "src/features/ideas/{raise,receivers,replies,finalize,benchmarks,company-read}.ts",
      "src/features/projects/{permissions,views}.ts",
      "src/server/{case-notice,loop-notice}.ts",
      "src/server/actions/events.ts",
    ]);
    const hits = results.flatMap((r) => r.messages.filter((m) => m.ruleId === RULE).map((m) => `${r.filePath}:${m.line}`));
    expect(hits).toEqual([]);
  }, 120_000);
});
