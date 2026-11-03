import { describe, expect, it } from "vitest";
import { SETTINGS_SECTIONS, setupStep, visibleSections } from "@/features/settings/sections";
import { en } from "@/i18n/en";
import { de } from "@/i18n/de";

const full = { named: true, units: 1, linkedSeats: 1, routes: 1, members: 2 };

describe("ADM settings sections", () => {
  it("lists the sections of D7 in order with their paths", () => {
    expect(SETTINGS_SECTIONS.map((s) => s.key)).toEqual(["setup", "company", "rules", "calendar", "org", "routing", "members", "notifications", "areas", "privacy", "audit"]);
    expect(SETTINGS_SECTIONS.map((s) => s.path)).toEqual(["setup", "company", "rules", "calendar", "org", "routing", "members", "notifications", "areas", "privacy", "audit"]);
  });

  it("has every label in both catalogs", () => {
    for (const s of SETTINGS_SECTIONS) {
      const [ns, key] = s.label.split(".") as [string, string];
      expect((en as Record<string, Record<string, string>>)[ns]?.[key], s.label).toBeTruthy();
      expect((de as Record<string, Record<string, string>>)[ns]?.[key], s.label).toBeTruthy();
    }
  });

  it("shows Setup first while setup is open and not at all when done", () => {
    expect(visibleSections(false)[0].key).toBe("setup");
    expect(visibleSections(true).some((s) => s.key === "setup")).toBe(false);
  });

  it("gives the first step not done", () => {
    expect(setupStep({ ...full, named: false })).toBe("company");
    expect(setupStep({ ...full, units: 0 })).toBe("units");
    expect(setupStep({ ...full, linkedSeats: 0 })).toBe("roles");
    expect(setupStep({ ...full, routes: 0 })).toBe("routes");
    expect(setupStep({ ...full, members: 1 })).toBe("members");
    expect(setupStep(full)).toBe("done");
  });
});
