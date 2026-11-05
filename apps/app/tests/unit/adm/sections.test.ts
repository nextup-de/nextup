import { describe, expect, it } from "vitest";
import { SETTINGS_SECTIONS, setupStep } from "@/features/settings/sections";
import { en } from "@/i18n/en";
import { de } from "@/i18n/de";

const full = { named: true, units: 1, seats: 1, routes: 1, members: 2 };

describe("ADM settings sections", () => {
  it("lists the sections of D7 in order with their paths", () => {
    expect(SETTINGS_SECTIONS.map((s) => s.key)).toEqual(["goLive", "company", "rules", "calendar", "org", "routing", "members", "importExport", "notifications", "webhooks", "apiTokens", "signIn", "supportAccess", "teams", "areas", "privacy", "audit", "pilotReport"]);
    expect(SETTINGS_SECTIONS.map((s) => s.path)).toEqual(["go-live", "company", "rules", "calendar", "org", "routing", "members", "import-export", "notifications", "webhooks", "api-tokens", "sign-in", "support-access", "teams", "areas", "privacy", "audit", "pilot-report"]);
  });

  it("has every label in both catalogs", () => {
    for (const s of SETTINGS_SECTIONS) {
      const [ns, key] = s.label.split(".") as [string, string];
      expect((en as Record<string, Record<string, string>>)[ns]?.[key], s.label).toBeTruthy();
      expect((de as Record<string, Record<string, string>>)[ns]?.[key], s.label).toBeTruthy();
    }
  });

  it("gives the first step not done", () => {
    expect(setupStep({ ...full, named: false })).toBe("company");
    expect(setupStep({ ...full, units: 0 })).toBe("units");
    expect(setupStep({ ...full, seats: 0 })).toBe("roles");
    expect(setupStep({ ...full, routes: 0 })).toBe("routes");
    expect(setupStep({ ...full, members: 1 })).toBe("members");
    expect(setupStep(full)).toBe("done");
  });
});
