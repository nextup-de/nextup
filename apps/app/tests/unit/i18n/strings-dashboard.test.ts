import { readdirSync } from "node:fs";
import { describe, expect, it } from "vitest";
import { catalogIssues, inlineStrings } from "./inline";

// dashboardPreview.ts is placeholder data that phase MET replaces; its labels stay as they are (LNG D9).
const SHARED = readdirSync("src/components/dashboard/shared")
  .filter((f) => /\.tsx?$/.test(f) && f !== "dashboardPreview.ts")
  .map((f) => `src/components/dashboard/shared/${f}`);

describe("LNG strings dashboard", () => {
  it("has no inline user-facing string in the shared views, the manager overview and the dashboard root files", async () => {
    const findings = await inlineStrings([
      ...SHARED,
      "src/components/dashboard/manager/**/*.{ts,tsx}",
      "src/components/dashboard/DemoProvider.tsx",
      "src/components/dashboard/RoleRouter.tsx",
      "src/components/dashboard/derive.ts",
    ]);
    expect(findings).toEqual([]);
  }, 60_000);

  it("has every dashboard key in de and en", () => {
    expect(catalogIssues("dashboard")).toEqual([]);
  });
});
