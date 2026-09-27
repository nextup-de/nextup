import { describe, expect, it } from "vitest";
import { proposeRoute } from "@/features/routing";

const ROUTES = [
  { id: "r1", keys: ["forklift", "shift"] },
  { id: "r8", keys: ["changeover", "mes", "sheet"] },
];

describe("proposeRoute", () => {
  it("picks the route with the most keyword hits", () => {
    expect(proposeRoute("The changeover sheet and MES ask for the same numbers", ROUTES)?.id).toBe("r8");
  });
  it("returns null when nothing matches", () => {
    expect(proposeRoute("hello", ROUTES)).toBeNull();
  });
});
