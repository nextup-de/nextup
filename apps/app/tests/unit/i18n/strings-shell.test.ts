import { describe, expect, it } from "vitest";
import { catalogIssues, inlineStrings } from "./inline";

const OWNED = [
  "src/components/shell/{AppShell,Ground,InputSheet,LoopSheets,NavSearch,ShellSkeleton,SimpleShell,TopBar}.tsx",
  "src/components/{auth,profile,settings,report,ui,demo}/**/*.{ts,tsx}",
  "src/app/{[company],demo,(auth)}/**/*.{ts,tsx}",
  "src/app/page.tsx",
];

describe("LNG strings shell", () => {
  it("has no inline user-facing string in the owned source files", async () => {
    expect(await inlineStrings(OWNED)).toEqual([]);
  }, 120_000);
  it("has complete namespaces", () => {
    for (const ns of ["shell", "auth", "profile", "settings", "report", "demo"]) expect(catalogIssues(ns)).toEqual([]);
  });
});
