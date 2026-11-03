import { describe, expect, it } from "vitest";
import { FLAGS } from "@/config/flags";
import { registryProblems } from "@/features/flags/resolve";
import { parseRulesForm, type FormFields } from "@/features/settings/company-forms";

const BASE: FormFields = {
  promiseDays: "3", outcomeDays: "30", discussEveryDays: "3", discussMaxRounds: "3", fastLaneEur: "0",
  measureDays: "30, 90", tolerancePct: "5", rewardRule: "thanks",
};
const SWITCHES = ["deadlineHandover", "stepDiscussion", "stepProjects", "stepMeasure", "stepRecognition"];

describe("LOOP switches", () => {
  it("discussion and projects default to on at every stage", () => {
    for (const key of ["discussion", "projects"] as const) {
      expect(FLAGS[key].defaults).toEqual({ demo: true, sandbox: true, pilot: true, live: true });
    }
  });
  it("the flag registry has no problems", () => {
    expect(registryProblems(FLAGS)).toEqual([]);
  });
  it("all five checkboxes absent: hand-over off and every step off", () => {
    const r = parseRulesForm(BASE);
    expect(r.ok).toBe(true);
    if (!r.ok) return;
    expect(r.value.rules.deadlineHandover).toBe(false);
    expect(r.value.rules.steps).toEqual({ discussion: false, projects: false, measure: false, recognition: false });
  });
  it("all five checkboxes present: hand-over on and every step on", () => {
    const r = parseRulesForm({ ...BASE, ...Object.fromEntries(SWITCHES.map((k) => [k, "on"])) });
    expect(r.ok).toBe(true);
    if (!r.ok) return;
    expect(r.value.rules.deadlineHandover).toBe(true);
    expect(r.value.rules.steps).toEqual({ discussion: true, projects: true, measure: true, recognition: true });
  });
});
