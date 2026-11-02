import { describe, expect, it } from "vitest";
import { sourceKind } from "@/features/directory";

describe("DIR directory types", () => {
  it("knows graph and successfactors", () => {
    expect(sourceKind("graph")).toBe("graph");
    expect(sourceKind("successfactors")).toBe("successfactors");
  });
  it("reads an unknown source as graph", () => {
    expect(sourceKind("x")).toBe("graph");
    expect(sourceKind(null)).toBe("graph");
  });
});
