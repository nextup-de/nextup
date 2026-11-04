import { describe, expect, it } from "vitest";
import { memberPrivacyActions } from "@/features/privacy/member-menu";

const base = { id: "u1", active: true, hasEmail: true, pseudonymisedAt: null };

describe("GDP member menu", () => {
  it("an active member offers export to the person or the admin and a disabled pseudonymise", () => {
    expect(memberPrivacyActions(base, "me")).toEqual({ exportTo: ["person", "admin"], pseudonymise: "disabled-active", deleteOnly: false });
  });
  it("an inactive member offers export to the admin only and pseudonymise", () => {
    expect(memberPrivacyActions({ ...base, active: false }, "me")).toEqual({ exportTo: ["admin"], pseudonymise: "enabled", deleteOnly: false });
  });
  it("a pseudonymised member offers only delete", () => {
    expect(memberPrivacyActions({ ...base, active: false, pseudonymisedAt: "2026-11-01T00:00:00.000Z" }, "me")).toEqual({ exportTo: [], pseudonymise: "hidden", deleteOnly: true });
  });
  it("a member without an email cannot get the export sent to them", () => {
    expect(memberPrivacyActions({ ...base, hasEmail: false }, "me").exportTo).toEqual(["admin"]);
  });
  it("nobody gets entries for themselves", () => {
    expect(memberPrivacyActions(base, "u1")).toEqual({ exportTo: [], pseudonymise: "hidden", deleteOnly: false });
  });
});
