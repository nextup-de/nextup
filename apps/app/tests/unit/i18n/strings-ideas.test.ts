import { describe, expect, it } from "vitest";
import { catalogIssues, inlineStrings } from "./inline";

// raisePreview.ts is placeholder data (LNG decision D9) and stays out of the proof.
const OWNED = [
  "src/components/ideas/*.tsx",
  "src/features/ideas/raise.ts",
  "src/features/ideas/receivers.ts",
  "src/features/ideas/replies.ts",
  "src/features/ideas/finalize.ts",
  "src/features/ideas/benchmarks.ts",
  "src/features/ideas/company-read.ts",
];

describe("LNG strings ideas", () => {
  it("has no inline user-facing string in the owned source files", async () => {
    expect(await inlineStrings(OWNED)).toEqual([]);
  }, 120_000);
  it("has a complete ideas namespace", () => {
    expect(catalogIssues("ideas")).toEqual([]);
  });
});
