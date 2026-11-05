import { describe, expect, it } from "vitest";
import { setupStep } from "@/features/settings/sections";
import { SETUP_FORM_STEPS, SETUP_STEP_ACTIONS } from "@/server/actions/settings/setup";
import * as company from "@/server/actions/settings/company";
import * as org from "@/server/actions/settings/org";
import * as members from "@/server/actions/members";
import { en } from "@/i18n/en";
import { de } from "@/i18n/de";

const modules = { "settings/company": company, "settings/org": org, members } as Record<string, Record<string, unknown>>;
const none = { named: false, units: 0, seats: 0, routes: 0, members: 1 };

describe("ADM setup steps", () => {
  it("starts at company until the name is set, then units", () => {
    expect(setupStep(none)).toBe("company");
    expect(setupStep({ ...none, named: true })).toBe("units");
  });

  it("asks for a seat after units, a route after a seat", () => {
    expect(setupStep({ ...none, named: true, units: 1 })).toBe("roles");
    expect(setupStep({ ...none, named: true, units: 1, seats: 1 })).toBe("routes");
  });

  it("asks for a second member while the admin is alone, then is done", () => {
    const c = { named: true, units: 1, seats: 1, routes: 1, members: 1 };
    expect(setupStep(c)).toBe("members");
    expect(setupStep({ ...c, members: 2 })).toBe("done");
  });

  it("maps each step key to an action exported by the settings modules", () => {
    expect(Object.keys(SETUP_STEP_ACTIONS).sort()).toEqual([...SETUP_FORM_STEPS].sort());
    for (const step of SETUP_FORM_STEPS) {
      const { module, action } = SETUP_STEP_ACTIONS[step];
      expect(typeof modules[module]?.[action], `${step} -> ${module}.${action}`).toBe("function");
    }
  });

  it("has the wizard strings in both catalogs", () => {
    const keys = Object.keys(en.settingsSetup);
    expect(keys).toContain("stepMembers");
    expect(Object.keys(de.settingsSetup).sort()).toEqual([...keys].sort());
  });
});
