// The company's hour cost (rule hour_cost): one value for the whole company, set in Settings › Rules (Kevin, 16 Nov).
import { describe, expect, it } from "vitest";
import { COMPANY_RULE_KEYS, DEFAULT_RULES, rowsFromRules, rulesFromRows } from "@/features/knowledge/rules";
import { readImpact } from "@/features/projects/measure-source";
import { parseRulesForm, type FormFields } from "@/features/settings/company-forms";

const base: FormFields = {
  promiseDays: "3", outcomeDays: "10", discussEveryDays: "2", discussMaxRounds: "4", fastLaneEur: "1000", measureDays: "30, 90", tolerancePct: "3", rewardRule: "thanks",
};

describe("the hour cost", () => {
  it("is a company rule that is saved and read back, and missing while empty", () => {
    expect(COMPANY_RULE_KEYS).toContain("hour_cost");
    expect(rulesFromRows(rowsFromRules({ ...DEFAULT_RULES, hourCostEur: 45 })).hourCostEur).toBe(45);
    expect(rowsFromRules(DEFAULT_RULES).some((r) => r.key === "hour_cost")).toBe(false);
    for (const eur of [0, 1001, 4.5, "45"]) expect(rulesFromRows([{ key: "hour_cost", value: { eur } }]).hourCostEur, String(eur)).toBeUndefined();
  });

  it("comes from the rules form: whole euros 1 to 1000, or empty", () => {
    const ok = parseRulesForm({ ...base, hourCostEur: "45" });
    expect(ok.ok && ok.value.rules.hourCostEur).toBe(45);
    const empty = parseRulesForm({ ...base, hourCostEur: "" });
    expect(empty.ok && empty.value.rules.hourCostEur).toBeUndefined();
    for (const v of ["0", "1001", "4.5", "abc"]) expect(parseRulesForm({ ...base, hourCostEur: v }), v).toMatchObject({ ok: false, field: "hourCostEur", error: "settingsCompany.errHourCost" });
  });

  it("prices hours a result carries as its fifth impact figure", () => {
    expect(readImpact({ hoursPerYear: 1200 })).toEqual({ hoursPerYear: 1200 });
    expect(readImpact({ hoursPerYear: -1 })).toBeNull();
  });
});
