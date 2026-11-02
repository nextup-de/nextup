import { describe, expect, it } from "vitest";
import { catalogIssues, inlineStrings } from "./inline";

const OWNED = ["src/components/projects/**/*.{ts,tsx}", "src/features/projects/permissions.ts", "src/features/projects/views.ts"];

describe("LNG strings projects", () => {
  it("has no inline user-facing string in the project components, permissions and views", async () => {
    expect(await inlineStrings(OWNED)).toEqual([]);
  }, 60_000);
  it("has a complete projects namespace", () => {
    expect(catalogIssues("projects")).toEqual([]);
  });
});
