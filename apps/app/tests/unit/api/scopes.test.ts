import { describe, expect, it } from "vitest";
import { ApiV1 } from "@nextup/contracts/public";
import { hasScope, OLD_SCOPES, SCOPES, V1_SCOPES } from "@/features/integrations";

describe("API scopes", () => {
  it("holds the old three and the five v1 scopes", () => {
    expect([...OLD_SCOPES]).toEqual(["events:read", "events:write", "knowledge:write"]);
    expect([...V1_SCOPES].sort()).toEqual(["cases:read", "cases:write", "decisions:read", "org:read", "projects:read"]);
    expect([...SCOPES]).toEqual([...OLD_SCOPES, ...V1_SCOPES]);
  });

  it("has V1_SCOPES equal to the scopes named by ApiV1.endpoints", () => {
    const named = [...new Set(ApiV1.endpoints.map((e) => e.scope))].sort();
    expect(named).toEqual([...V1_SCOPES].sort());
  });

  it("accepts each scope a token holds and refuses the others", () => {
    for (const s of SCOPES) {
      expect(hasScope([s], s)).toBe(true);
      expect(hasScope(SCOPES.filter((x) => x !== s), s)).toBe(false);
    }
    expect(hasScope([], "cases:read")).toBe(false);
  });
});
