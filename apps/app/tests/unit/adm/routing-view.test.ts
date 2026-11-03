import { describe, expect, it } from "vitest";
import { NO_KNOWLEDGE, type Knowledge } from "@/features/knowledge";
import { routeKeyFor, routingSummary, seatLine, shortName } from "@/features/settings/routing-view";

const k: Knowledge = {
  ...NO_KNOWLEDGE,
  holders: [
    { id: "h1", roleId: "lead", name: "Hanna Sander", userId: "u1", sort: 0 },
    { id: "h2", roleId: "lead", name: "Luca Brandt", userId: "u2", sort: 1 },
    { id: "h3", roleId: "empty", name: "Seat 1", userId: null, sort: 0 },
  ],
  rules: [
    { id: "r1", key: "a", type: "A", keywords: ["x"], ownerRoleId: "lead", deputyRoleId: null, buddyRoleId: null, wait: "1d", sort: 0 },
    { id: "r2", key: "b", type: "B", keywords: ["y"], ownerRoleId: "empty", deputyRoleId: "lead", buddyRoleId: null, wait: "1d", sort: 1 },
  ],
};

describe("routing view", () => {
  it("shortens names", () => {
    expect(shortName("Hanna Sander")).toBe("H. Sander");
    expect(shortName("Ana María López")).toBe("A. María López");
    expect(shortName("Ops")).toBe("Ops");
  });

  it("lists linked seats only", () => {
    expect(seatLine(k, "lead")).toBe("H. Sander +1");
    expect(seatLine(k, "empty")).toBe("");
  });

  it("counts routes, vacant owners and missing deputies", () => {
    expect(routingSummary(k)).toEqual({ routes: 2, vacantOwners: 1, noDeputy: 1 });
  });

  it("makes a unique key from the request type", () => {
    expect(routeKeyFor("Spend under €5k", [])).toBe("spend_under_5k");
    expect(routeKeyFor("Safety", ["safety", "safety_2"])).toBe("safety_3");
    expect(routeKeyFor("€€€", [])).toBe("route");
  });
});
