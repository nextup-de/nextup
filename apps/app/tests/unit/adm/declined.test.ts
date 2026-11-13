// Q9.1: "We do not use this" from the audit rows, newest first.
import { describe, expect, it } from "vitest";
import { cleanReason, declinedFrom, isDeclinable } from "@/features/settings/declined";
import { AUDIT_KEPT_ACTIONS } from "@/features/privacy/retention";
import { isAuditAction } from "@/features/audit";

const at = (iso: string) => new Date(iso);

describe("declinedFrom", () => {
  it("takes the newest row per system: a reopen after a decline clears it, a decline after a reopen sets it", () => {
    const rows = [
      { action: "audit.connector.reopened", at: at("2026-11-05T00:00:00Z"), changes: { system: "jira" } },
      { action: "audit.connector.declined", at: at("2026-11-04T00:00:00Z"), changes: { system: "teams", reason: "Mail is enough" } },
      { action: "audit.connector.declined", at: at("2026-11-03T00:00:00Z"), changes: { system: "jira", reason: "SAP PS" } },
      { action: "audit.connector.reopened", at: at("2026-11-02T00:00:00Z"), changes: { system: "teams" } },
      { action: "audit.connector.declined", at: at("2026-11-01T00:00:00Z"), changes: { system: "fax", reason: "?" } },
    ];
    expect(declinedFrom(rows)).toEqual({ teams: { at: "2026-11-04T00:00:00.000Z", reason: "Mail is enough" } });
  });
});

describe("cleanReason", () => {
  it("folds a reason into one line and refuses an empty or too long one", () => {
    expect(cleanReason("  We track\nwork in SAP  ")).toBe("We track work in SAP");
    expect(cleanReason("   ")).toBeNull();
    expect(cleanReason("x".repeat(201))).toBeNull();
    expect(cleanReason(7)).toBeNull();
  });

  it("knows the six systems", () => {
    for (const s of ["entra", "directory", "teams", "jira", "m365", "ai"]) expect(isDeclinable(s), s).toBe(true);
    expect(isDeclinable("sap")).toBe(false);
  });
});

describe("retention keeps the rows that are state", () => {
  it("names only real audit actions", () => {
    for (const a of AUDIT_KEPT_ACTIONS) expect(isAuditAction(a), a).toBe(true);
  });
});
