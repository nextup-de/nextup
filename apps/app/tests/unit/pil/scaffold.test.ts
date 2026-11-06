import { describe, expect, it } from "vitest";
import { signsOutOnMove, stageMeaning, STAGES } from "@/features/admin/stages";
import { SETTINGS_SECTIONS } from "@/features/settings/sections";
import { en } from "@/i18n/en";
import { de } from "@/i18n/de";

describe("PIL scaffold", () => {
  it("signs out only when leaving demo or moving back", () => {
    for (const from of STAGES) {
      for (const to of STAGES) {
        const expected = from === "demo" || STAGES.indexOf(to) < STAGES.indexOf(from);
        expect(signsOutOnMove(from, to), `${from} -> ${to}`).toBe(expected);
      }
    }
    expect(signsOutOnMove("sandbox", "pilot")).toBe(false);
    expect(signsOutOnMove("pilot", "live")).toBe(false);
    expect(signsOutOnMove("demo", "sandbox")).toBe(true);
    expect(signsOutOnMove("pilot", "sandbox")).toBe(true);
  });

  it("reads the promise days in the pilot line", () => {
    expect(stageMeaning("pilot", 3)).toBe("Their real cases, with the 3-working-day promise running.");
    expect(stageMeaning("sandbox", 3)).not.toContain("3");
  });

  it("has both sections", () => {
    expect(SETTINGS_SECTIONS.find((s) => s.key === "goLive")).toEqual({ key: "goLive", path: "go-live", label: "settingsGoLive.navLabel", group: "start" });
    expect(SETTINGS_SECTIONS.find((s) => s.key === "pilotReport")).toEqual({ key: "pilotReport", path: "pilot-report", label: "settingsPilotReport.navLabel", group: "data" });
  });

  it("has every text in German and English, with the same placeholders", () => {
    for (const ns of ["settingsGoLive", "settingsPilotReport"] as const) {
      const e = en[ns] as Record<string, string>;
      const d = de[ns] as Record<string, string>;
      expect(Object.keys(d).sort()).toEqual(Object.keys(e).sort());
      for (const k of Object.keys(e)) {
        expect(d[k], `${ns}.${k}`).toBeTruthy();
        const ph = (s: string) => (s.match(/\{\w+\}/g) ?? []).sort().join();
        expect(ph(d[k]), `${ns}.${k}`).toBe(ph(e[k]));
      }
    }
    expect(en.settingsPilotReport.lead).not.toContain("total");
    expect(en.settingsPilotReport.mailSubject).toContain("{week}");
    expect(de.settingsGoLive.blockedHint_other).toBe("Zuerst brauchen {n} Prüfungen Sie.");
  });
});
