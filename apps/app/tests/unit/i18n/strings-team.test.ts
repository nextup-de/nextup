import { describe, expect, it } from "vitest";
import { catalogIssues, inlineStrings } from "./inline";

// Placeholder data that phase MET replaces (LNG decision D9): left out of the proof.
const PLACEHOLDERS = ["src/components/dashboard/team/overviewPreview.ts"];

describe("LNG strings team leader", () => {
  it("has no inline user-facing string in the team and leader views", async () => {
    const findings = await inlineStrings(["src/components/dashboard/team/**/*.{ts,tsx}", "src/components/dashboard/leader/**/*.{ts,tsx}"]);
    expect(findings.filter((f) => !PLACEHOLDERS.includes(f.file))).toEqual([]);
  }, 60_000);
  it("has complete team and leader namespaces", () => {
    expect(catalogIssues("team")).toEqual([]);
    expect(catalogIssues("leader")).toEqual([]);
  });
});
