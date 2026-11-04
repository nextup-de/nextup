import { describe, expect, it } from "vitest";
import { catalogIssues, inlineStrings } from "./inline";

describe("LNG strings team leader", () => {
  it("has no inline user-facing string in the team and leader views", async () => {
    const findings = await inlineStrings(["src/components/dashboard/team/**/*.{ts,tsx}", "src/components/dashboard/leader/**/*.{ts,tsx}"]);
    expect(findings).toEqual([]);
  }, 60_000);
  it("has complete team and leader namespaces", () => {
    expect(catalogIssues("team")).toEqual([]);
    expect(catalogIssues("leader")).toEqual([]);
  });
});
