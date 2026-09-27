// The security rules that are pure enough to pin down: what each stage allows, the attempt
// counter, and which post-login redirects may leave the site (none).
import { describe, expect, it } from "vitest";
import { canMoveStage, holdsRealPeople, policyFor, STAGES } from "@/features/admin/stages";
import { clientAddress, hit, sweep, waitText, type Window } from "@/features/security/rate-limit";
import { safeNextPath } from "@/features/tenant/urls";

describe("stage policy", () => {
  it("demo is the only stage with demo tools", () => {
    const demo = policyFor("demo");
    expect(demo).toEqual({ demoData: true, demoLogin: true, switchPerson: true, rewriteHistory: true });
    for (const stage of STAGES.filter((s) => s !== "demo")) {
      const p = policyFor(stage);
      expect(Object.values(p).every((v) => v === false), stage).toBe(true);
      expect(holdsRealPeople(stage)).toBe(true);
    }
  });

  it("an unknown stage fails closed", () => {
    expect(policyFor("").switchPerson).toBe(false);
    expect(policyFor("Demo").demoLogin).toBe(false);
    expect(holdsRealPeople("whatever")).toBe(true);
  });

  it("a company with real people never moves back to demo", () => {
    expect(canMoveStage("demo", "sandbox")).toBe(true);
    expect(canMoveStage("pilot", "sandbox")).toBe(true); // rollback between real stages is fine
    expect(canMoveStage("sandbox", "demo")).toBe(false);
    expect(canMoveStage("live", "demo")).toBe(false);
    expect(canMoveStage("demo", "nonsense")).toBe(false);
  });
});

describe("rate limit", () => {
  const rule = { limit: 3, windowMs: 60_000 };

  it("allows the limit, then blocks until the window resets", () => {
    const store = new Map<string, Window>();
    expect(hit(store, "k", rule, 0)).toEqual({ ok: true, remaining: 2 });
    hit(store, "k", rule, 1);
    expect(hit(store, "k", rule, 2)).toEqual({ ok: true, remaining: 0 });
    expect(hit(store, "k", rule, 3)).toEqual({ ok: false, retryAfterSeconds: 60 });
    expect(hit(store, "k", rule, 60_000).ok).toBe(true);
  });

  it("counts keys separately", () => {
    const store = new Map<string, Window>();
    for (let i = 0; i < 3; i++) hit(store, "a", rule, 0);
    expect(hit(store, "a", rule, 0).ok).toBe(false);
    expect(hit(store, "b", rule, 0).ok).toBe(true);
  });

  it("sweeps expired windows", () => {
    const store = new Map<string, Window>();
    hit(store, "old", rule, 0);
    hit(store, "new", rule, 50_000);
    sweep(store, 60_000);
    expect([...store.keys()]).toEqual(["new"]);
  });

  it("says how long to wait in words", () => {
    expect(waitText(1)).toBe("1 second");
    expect(waitText(40)).toBe("40 seconds");
    expect(waitText(61)).toBe("2 minutes");
  });

  it("takes the first forwarded address, and one shared bucket without any", () => {
    expect(clientAddress("203.0.113.7, 10.0.0.1", null)).toBe("203.0.113.7");
    expect(clientAddress(null, "198.51.100.2")).toBe("198.51.100.2");
    expect(clientAddress(null, null)).toBe("unknown");
  });
});

describe("post-login redirect", () => {
  it("keeps same-site paths", () => {
    expect(safeNextPath("/cases/c1?tab=log")).toBe("/cases/c1?tab=log");
    expect(safeNextPath("/")).toBe("/");
  });

  it("refuses anything that could leave the site", () => {
    for (const bad of ["//evil.com", "/\\evil.com", "/\\/evil.com", "https://evil.com", "evil.com", "", "/ok\n//x", "/" + "a".repeat(600)]) {
      expect(safeNextPath(bad), JSON.stringify(bad)).toBeNull();
    }
  });
});
