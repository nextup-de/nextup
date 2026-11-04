import { describe, expect, it } from "vitest";
import { AUDIT_ACTIONS } from "@/features/audit";
import { SETTINGS_SECTIONS } from "@/features/settings/sections";
import { en } from "@/i18n/en";
import { de } from "@/i18n/de";

describe("SEC scaffold", () => {
  it("has the Support access section after sign-in", () => {
    const i = SETTINGS_SECTIONS.findIndex((s) => s.key === "supportAccess");
    expect(SETTINGS_SECTIONS[i]).toEqual({ key: "supportAccess", path: "support-access", label: "settingsSupport.navLabel", group: "data" });
    expect(SETTINGS_SECTIONS[i - 1].key).toBe("signIn");
  });

  it("has the settingsSupport namespace in both languages", () => {
    for (const cat of [en, de]) {
      const ns = cat.settingsSupport as Record<string, string>;
      for (const k of ["navLabel", "title", "lead"]) expect(ns[k], k).toBeTruthy();
    }
    expect(en.settingsSupport.title).toBe("Support access");
  });

  it("has the audit action support_extended with labels", () => {
    expect(AUDIT_ACTIONS).toContain("audit.access.support_extended");
    expect((en.settingsAudit as Record<string, string>).audit_access_support_extended).toBe("Support access extended");
    expect((de.settingsAudit as Record<string, string>).audit_access_support_extended).toBe("Supportzugang verlängert");
  });
});
