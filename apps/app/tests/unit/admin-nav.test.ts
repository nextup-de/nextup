// The sidebar carries state, so these are the rules for when it shouts. A badge that is always there
// is wallpaper; the point is that "3 stuck" only appears when three are stuck.
import { describe, expect, it } from "vitest";
import { adminBase, jiraBadge, lockedOut } from "@/features/admin/nav";
import { nextStage, STAGES, isStage } from "@/features/admin/stages";

describe("adminBase", () => {
  it("is /admin in path mode and the host root on the admin subdomain", () => {
    expect(adminBase("path")).toBe("/admin");
    expect(adminBase(undefined)).toBe("/admin");
    expect(adminBase("subdomain")).toBe("");
  });
});

describe("stages", () => {
  it("walks demo -> sandbox -> pilot -> live and stops there", () => {
    expect(nextStage("demo")).toBe("sandbox");
    expect(nextStage("sandbox")).toBe("pilot");
    expect(nextStage("pilot")).toBe("live");
    expect(nextStage("live")).toBeNull();
  });

  it("has no next step for something that is not a stage", () => {
    expect(nextStage("banana")).toBeNull();
    expect(isStage("banana")).toBe(false);
    expect(STAGES.every(isStage)).toBe(true);
  });
});

describe("jiraBadge", () => {
  it("says nothing without a Jira row, while it is off, or while it runs fine", () => {
    expect(jiraBadge(undefined)).toMatchObject({ badge: null, tone: null });
    expect(jiraBadge(null)).toMatchObject({ badge: null, tone: null });
    expect(jiraBadge({ on: false, failing: true, tokenExpired: true })).toMatchObject({ badge: null, tone: null });
    expect(jiraBadge({ on: true, failing: false, tokenExpired: false })).toMatchObject({ badge: null, tone: null });
  });

  it("shouts when a running sync fails, loudest for a refused token", () => {
    expect(jiraBadge({ on: true, failing: true, tokenExpired: false })).toMatchObject({ badge: "sync error", tone: "warn" });
    expect(jiraBadge({ on: true, failing: true, tokenExpired: true })).toMatchObject({ badge: "token expired", tone: "bad" });
  });
});

describe("lockedOut", () => {
  const person = (over: Partial<{ codeIssuedAt: string | null; microsoft: boolean }>) => ({
    id: "u", name: "A", email: "a@x", role: "employee", codeIssuedAt: null, microsoft: false, ...over,
  });

  it("counts people with neither a code nor a Microsoft account the company still accepts", () => {
    const persons = [person({ codeIssuedAt: "2026-09-01" }), person({ microsoft: true }), person({})];
    expect(lockedOut({ persons, entraTenantId: "72f988bf-86f1-41af-91ab-2d7cd011db47" })).toHaveLength(1);
    // Microsoft switched off: a bound account no longer gets anyone in.
    expect(lockedOut({ persons, entraTenantId: null })).toHaveLength(2);
  });
});
