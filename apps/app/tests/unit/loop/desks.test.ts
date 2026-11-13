import { describe, expect, it } from "vitest";
import type { Route } from "@/features/demo/types";
import type { SeatRow } from "@/features/auth/identity";
import { desksFor, otherDesks, type DeskInput } from "@/features/ideas/desks";

const route = (id: string, type: string, keys: string[], roleId: string | null, role: string, dept: string): Route => ({
  id, type, keys, owner: { name: "Somebody", role, dept }, deputy: "", buddy: "", wait: "", ownerRoleId: roleId,
});
const routes: Route[] = [
  route("r-budget", "Budget", ["budget", "invoice"], "role-fin", "Finance lead", "Finance"),
  route("r-safety", "Safety", ["safety", "guard", "helmet"], "role-ehs", "Safety officer", "Production"),
  route("r-it", "IT access", ["laptop", "access"], "role-it", "IT admin", "IT"),
  route("r-it2", "IT hardware", ["laptop", "monitor"], "role-it", "IT admin", "IT"),
  route("r-orphan", "Orphan", ["orphan"], null, "Nobody", "None"),
  route("r-hr", "People", ["hiring"], "role-hr", "HR partner", "People"),
];
const seats: SeatRow[] = [
  { id: "s1", roleId: "role-fin", label: "Finance 1", userId: "u1", sort: 1 },
  { id: "s2", roleId: "role-ehs", label: "Safety 1", userId: null, sort: 1 },
  { id: "s3", roleId: "role-it", label: "IT 1", userId: "u3", sort: 1 },
  { id: "s4", roleId: "role-it", label: "IT 2", userId: null, sort: 2 },
];
const base: DeskInput = { text: "", routes, seats, proposal: null, myDept: "Production", affected: [], spendLimitEur: null };

describe("LOOP desk suggestions", () => {
  it("an llm proposal comes first tagged ai, two keyword routes follow", () => {
    const d = desksFor({ ...base, text: "safety guard and a new laptop plus budget", proposal: { routeId: "r-hr", confidence: 80, source: "llm", version: "v" } }, "en");
    expect(d.map((x) => x.routeId)).toEqual(["r-hr", "r-safety", "r-budget"]);
    expect(d[0].proposedBy).toBe("ai");
    expect(d[0].recommended).toBe(true);
    expect(d[1].proposedBy).toBe("keywords");
    expect(d.filter((x) => x.recommended)).toHaveLength(1);
  });
  it("a keywords proposal is tagged keywords", () => {
    const d = desksFor({ ...base, text: "x", proposal: { routeId: "r-hr", confidence: 60, source: "keywords", version: "v" } }, "en");
    expect(d[0].proposedBy).toBe("keywords");
  });
  it("most keywords first", () => {
    const d = desksFor({ ...base, text: "safety guard helmet and budget" }, "en");
    expect(d.map((x) => x.routeId)).toEqual(["r-safety", "r-budget"]);
  });
  it("a role owning two matching routes appears once", () => {
    const d = desksFor({ ...base, text: "laptop monitor access" }, "en");
    expect(d.filter((x) => x.roleId === "role-it")).toHaveLength(1);
  });
  it("never more than 3, and routes without an owner role are skipped", () => {
    const d = desksFor({ ...base, text: "budget safety laptop hiring orphan", proposal: { routeId: "r-orphan", confidence: 50, source: "llm", version: "v" } }, "en");
    expect(d.length).toBeLessThanOrEqual(3);
    expect(d.map((x) => x.routeId)).not.toContain("r-orphan");
  });
  it("a vacant desk names who gets it instead: the holders of the route's deputy role", () => {
    const withDeputy = routes.map((r) => (r.id === "r-safety" ? { ...r, deputyRoleId: "role-fin" } : r.id === "r-budget" ? { ...r, deputyRoleId: "role-it" } : r));
    const by = (roleId: string) => otherDesks(withDeputy, seats, "", "en").find((x) => x.roleId === roleId);
    expect(by("role-ehs")).toMatchObject({ vacant: true, deputies: ["Finance 1"] });
    // A desk someone sits at keeps its raises, and a vacant one without a deputy role names nobody.
    expect(by("role-fin")).toMatchObject({ vacant: false, deputies: [] });
    expect(otherDesks(routes, seats, "", "en").find((x) => x.roleId === "role-ehs")?.deputies).toEqual([]);
  });

  it("a desk carries no answer yet: the caller that has the state fills it (plan OVL, D25)", () => {
    expect(desksFor({ ...base, text: "safety guard and budget" }, "en").map((d) => d.answer)).toEqual([null, null]);
    expect(otherDesks(routes, seats, "", "en").every((d) => d.answer === null)).toBe(true);
  });

  it("a role without a seat holding a user is vacant", () => {
    const d = desksFor({ ...base, text: "safety budget laptop" }, "en");
    const by = (id: string) => d.find((x) => x.roleId === id);
    expect(by("role-ehs")?.vacant).toBe(true);
    expect(by("role-ehs")?.holders).toEqual([]);
    expect(by("role-fin")?.vacant).toBe(false);
    expect(by("role-fin")?.holders).toEqual(["Finance 1"]);
  });
  it("no score, no person, no answered-case count", () => {
    const d = desksFor({ ...base, text: "budget for 500 € safety", affected: ["Finance"], spendLimitEur: 1000 }, "en");
    for (const desk of d) {
      expect(desk).not.toHaveProperty("score");
      const all = desk.reasons.join(" | ");
      expect(all).not.toContain("Somebody");
      expect(all).not.toContain("Finance 1");
      expect(all).not.toMatch(/answered|\d+ of the last|%/i);
    }
  });
  it("reasons: owns, mentions, area; spend only within the limit", () => {
    const within = desksFor({ ...base, text: "budget for 500 €", spendLimitEur: 1000 }, "en")[0];
    expect(within.reasons[0]).toContain("Budget");
    expect(within.reasons.some((r) => r.includes("budget"))).toBe(true);
    expect(within.reasons.some((r) => r.includes("approve"))).toBe(true);
    const over = desksFor({ ...base, text: "budget for 5000 €", spendLimitEur: 1000 }, "en")[0];
    expect(over.reasons.some((r) => r.includes("approve"))).toBe(false);
    const none = desksFor({ ...base, text: "budget for 5 €" }, "en")[0];
    expect(none.reasons.some((r) => r.includes("approve"))).toBe(false);
    const area = desksFor({ ...base, text: "safety" }, "en")[0];
    expect(area.reasons.some((r) => r.includes("Production"))).toBe(true);
    const named = desksFor({ ...base, text: "budget", affected: ["Finance"] }, "en")[0];
    expect(named.reasons.some((r) => r.includes("Finance is their area"))).toBe(true);
  });
  it("otherDesks lists every owning role once, filtered by title and department, sorted by title", () => {
    const all = otherDesks(routes, seats, "", "en");
    expect(all.map((x) => x.title)).toEqual(["Finance lead", "HR partner", "IT admin", "Safety officer"]);
    expect(all.every((x) => x.proposedBy === null && x.reasons.length === 1)).toBe(true);
    expect(otherDesks(routes, seats, "SAFETY", "en").map((x) => x.roleId)).toEqual(["role-ehs"]);
    expect(otherDesks(routes, seats, "people", "en").map((x) => x.roleId)).toEqual(["role-hr"]);
  });
});
